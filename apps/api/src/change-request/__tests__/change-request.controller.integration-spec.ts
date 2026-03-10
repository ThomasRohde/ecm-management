/**
 * Integration tests for ChangeRequestController and CapabilityChangeRequestController.
 *
 * These tests boot the full NestJS application against a local Postgres
 * database and exercise the HTTP layer end-to-end: routing, UUID pipe
 * validation, header extraction, DTO validation, service delegation, and
 * exception-to-HTTP-status mapping.
 */

import { randomUUID } from 'node:crypto';
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { type INestApplication, ValidationPipe } from '@nestjs/common';
import {
  ApprovalDecisionOutcome,
  CapabilityType as PrismaCapabilityType,
  ChangeRequestStatus,
  ChangeRequestType,
  LifecycleStatus as PrismaLifecycleStatus,
  MappingState as PrismaMappingState,
} from '@prisma/client';
import { Test, type TestingModule } from '@nestjs/testing';
import { config as loadDotEnv } from 'dotenv';
import { AppModule } from '../../app.module';
import { PrismaService } from '../../prisma/prisma.service';
import { CURATOR_ROLE, GOVERNANCE_BOARD_ROLE } from '../change-request.service';

// ─── Env bootstrap (mirrors capability integration spec) ──────────────────────

function loadIntegrationEnvironment(): void {
  const candidatePaths = [
    resolve(process.cwd(), '.env.test.local'),
    resolve(process.cwd(), '.env.test'),
    resolve(process.cwd(), '.env'),
    resolve(process.cwd(), '../../.env'),
  ];

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      loadDotEnv({ path: envPath, override: false, quiet: true });
    }
  }

  if (process.env.TEST_DATABASE_URL) {
    process.env.DATABASE_URL = process.env.TEST_DATABASE_URL;
  }

  const databaseUrl = process.env.DATABASE_URL;

  if (!databaseUrl) {
    throw new Error(
      'Integration tests require DATABASE_URL or TEST_DATABASE_URL to be set',
    );
  }

  const hostname = new URL(databaseUrl).hostname;

  if (!['localhost', '127.0.0.1'].includes(hostname)) {
    throw new Error(
      `Integration tests only run against a local Postgres database, received host "${hostname}"`,
    );
  }
}

loadIntegrationEnvironment();

// ─── Minimal response shapes ──────────────────────────────────────────────────

interface ChangeRequestResponse {
  id: string;
  type: string;
  status: string;
  requestedBy: string;
  rationale: string | null;
  affectedCapabilityIds: string[];
  approvalDecisions: Array<{
    id: string;
    approverRole: string;
    approverId: string;
    decision: string;
    comment: string | null;
    decidedAt: string;
  }>;
  auditEntries: Array<{
    id: string;
    actorId: string;
    eventType: string;
    fromStatus: string | null;
    toStatus: string | null;
    comment: string | null;
  }>;
}

interface ChangeRequestListResponse {
  items: ChangeRequestResponse[];
  total: number;
}

interface ApiErrorResponse {
  statusCode: number;
  message: string | string[];
  error?: string;
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

describe('ChangeRequestController (integration)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let baseUrl: string;

  // Shared capability IDs for tests that need real capabilities
  let capId1: string;
  let capId2: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api/v1');
    app.useGlobalPipes(
      new ValidationPipe({
        whitelist: true,
        forbidNonWhitelisted: true,
        transform: true,
        transformOptions: { enableImplicitConversion: true },
      }),
    );

    await app.listen(0);
    baseUrl = `${await app.getUrl()}/api/v1`;
    prisma = app.get(PrismaService);

    // Seed two capabilities that will be referenced as affectedCapabilityIds
    // in tests that exercise execute() (which creates CapabilityLock records
    // with a FK back to capability).
    const suffix = randomUUID();
    const cap1 = await prisma.capability.create({
      data: {
        uniqueName: `cr-it-cap-1-${suffix}`,
        aliases: [],
        sourceReferences: [],
        tags: [],
        type: PrismaCapabilityType.LEAF,
        lifecycleStatus: PrismaLifecycleStatus.DRAFT,
      },
    });
    const cap2 = await prisma.capability.create({
      data: {
        uniqueName: `cr-it-cap-2-${suffix}`,
        aliases: [],
        sourceReferences: [],
        tags: [],
        type: PrismaCapabilityType.LEAF,
        lifecycleStatus: PrismaLifecycleStatus.DRAFT,
      },
    });
    capId1 = cap1.id;
    capId2 = cap2.id;
  });

  afterAll(async () => {
    // Clean up any remaining change request artefacts that reference our caps.
    // Capability locks are deleted on complete/fail; clean up any stragglers.
    await prisma.capabilityLock.deleteMany({
      where: { capabilityId: { in: [capId1, capId2] } },
    });
    // Phase 6A added CapabilityVersion with a non-cascade FK – delete before capability rows.
    await prisma.capabilityVersion.deleteMany({
      where: { capabilityId: { in: [capId1, capId2] } },
    });
    await prisma.capability.deleteMany({
      where: { id: { in: [capId1, capId2] } },
    });
    await app.close();
  });

  // ─── Helpers ────────────────────────────────────────────────────────────────

  async function post<T>(
    path: string,
    body?: unknown,
    headers?: Record<string, string>,
  ): Promise<{ status: number; body: T }> {
    const resolvedHeaders = { ...headers };
    if (resolvedHeaders['x-user-id'] && !resolvedHeaders['x-user-role']) {
      resolvedHeaders['x-user-role'] = CURATOR_ROLE;
    }

    const response = await fetch(`${baseUrl}${path}`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...resolvedHeaders },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    return { status: response.status, body: (await response.json()) as T };
  }

  async function get<T>(
    path: string,
  ): Promise<{ status: number; body: T }> {
    const response = await fetch(`${baseUrl}${path}`);
    return { status: response.status, body: (await response.json()) as T };
  }

  async function createDraftCr(
    affectedCapabilityIds: string[] = [capId1],
    requestedBy = 'test-user',
  ): Promise<ChangeRequestResponse> {
    const res = await post<ChangeRequestResponse>(
      '/change-requests',
      {
        type: ChangeRequestType.UPDATE,
        rationale: 'Integration test rationale',
        affectedCapabilityIds,
      },
      { 'x-user-id': requestedBy },
    );
    expect(res.status).toBe(201);
    return res.body;
  }

  async function advanceToStatus(
    id: string,
    targetStatus: ChangeRequestStatus,
    _affectedCapabilityIds: string[] = [capId1],
  ): Promise<ChangeRequestResponse> {
    const order: ChangeRequestStatus[] = [
      ChangeRequestStatus.DRAFT,
      ChangeRequestStatus.SUBMITTED,
      ChangeRequestStatus.PENDING_APPROVAL,
      ChangeRequestStatus.APPROVED,
      ChangeRequestStatus.EXECUTING,
      ChangeRequestStatus.COMPLETED,
    ];

    const current = await get<ChangeRequestResponse>(`/change-requests/${id}`);
    let crStatus = current.body.status as ChangeRequestStatus;

    for (let i = order.indexOf(crStatus) + 1; i <= order.indexOf(targetStatus); i++) {
      const next = order[i]!;
      let res: { status: number; body: ChangeRequestResponse };

      if (next === ChangeRequestStatus.SUBMITTED) {
        res = await post(`/change-requests/${id}/submit`, {}, { 'x-user-id': 'user-1' });
      } else if (next === ChangeRequestStatus.PENDING_APPROVAL) {
        res = await post(`/change-requests/${id}/request-approval`, {}, { 'x-user-id': 'user-1' });
      } else if (next === ChangeRequestStatus.APPROVED) {
        // Curator decision
        await post(
          `/change-requests/${id}/decisions`,
          { decision: ApprovalDecisionOutcome.APPROVED },
          { 'x-user-id': 'curator-user', 'x-user-role': CURATOR_ROLE },
        );
        // Governance board decision
        res = await post(
          `/change-requests/${id}/decisions`,
          { decision: ApprovalDecisionOutcome.APPROVED },
          { 'x-user-id': 'gb-user', 'x-user-role': GOVERNANCE_BOARD_ROLE },
        );
      } else if (next === ChangeRequestStatus.EXECUTING) {
        res = await post(`/change-requests/${id}/execute`, {}, { 'x-user-id': 'user-1' });
      } else if (next === ChangeRequestStatus.COMPLETED) {
        res = await post(`/change-requests/${id}/complete`, {}, { 'x-user-id': 'user-1' });
      } else {
        break;
      }

      expect(res!.status).toBe(200);
      crStatus = res!.body.status as ChangeRequestStatus;
    }

    return (await get<ChangeRequestResponse>(`/change-requests/${id}`)).body;
  }

  // ─── POST /change-requests ───────────────────────────────────────────────

  describe('POST /change-requests', () => {
    it('creates a DRAFT change request with correct fields and audit entry', async () => {
      const res = await post<ChangeRequestResponse>(
        '/change-requests',
        {
          type: ChangeRequestType.UPDATE,
          rationale: 'Q1 restructure',
          affectedCapabilityIds: [capId1, capId2],
          impactSummary: 'Minor path changes',
        },
        { 'x-user-id': 'alice' },
      );

      expect(res.status).toBe(201);
      expect(res.body.status).toBe(ChangeRequestStatus.DRAFT);
      expect(res.body.type).toBe(ChangeRequestType.UPDATE);
      expect(res.body.requestedBy).toBe('alice');
      expect(res.body.affectedCapabilityIds).toEqual(
        expect.arrayContaining([capId1, capId2]),
      );
      // Audit trail must record creation
      expect(res.body.auditEntries).toHaveLength(1);
      expect(res.body.auditEntries[0]).toMatchObject({
        eventType: 'CREATED',
        actorId: 'alice',
        toStatus: ChangeRequestStatus.DRAFT,
      });
    });

    it('returns 401 when auth headers are missing', async () => {
      const res = await post<ChangeRequestResponse>('/change-requests', {
        type: ChangeRequestType.CREATE,
        rationale: 'No auth header',
        affectedCapabilityIds: [capId1],
      });

      expect(res.status).toBe(401);
    });

    it('returns 400 on missing required fields', async () => {
      const res = await post<ApiErrorResponse>(
        '/change-requests',
        {
          rationale: 'Missing type and affectedCapabilityIds',
        },
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when affectedCapabilityIds contains non-UUID values', async () => {
      const res = await post<ApiErrorResponse>(
        '/change-requests',
        {
          type: ChangeRequestType.UPDATE,
          rationale: 'Bad ids',
          affectedCapabilityIds: ['not-a-uuid'],
        },
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(400);
    });

    it('returns 400 when affectedCapabilityIds is empty', async () => {
      const res = await post<ApiErrorResponse>(
        '/change-requests',
        {
          type: ChangeRequestType.UPDATE,
          rationale: 'Empty ids array',
          affectedCapabilityIds: [],
        },
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /change-requests ────────────────────────────────────────────────

  describe('GET /change-requests', () => {
    it('returns all change requests without filters', async () => {
      await createDraftCr();

      const res = await get<ChangeRequestListResponse>('/change-requests');

      expect(res.status).toBe(200);
      expect(res.body.total).toBeGreaterThanOrEqual(1);
      expect(Array.isArray(res.body.items)).toBe(true);
    });

    it('filters by status', async () => {
      const cr = await createDraftCr();

      const res = await get<ChangeRequestListResponse>(
        `/change-requests?status=${ChangeRequestStatus.DRAFT}`,
      );

      expect(res.status).toBe(200);
      const found = res.body.items.find((item) => item.id === cr.id);
      expect(found).toBeDefined();
    });

    it('filters by requestedBy', async () => {
      const uniqueUser = `filter-user-${randomUUID()}`;
      const cr = await createDraftCr([capId1], uniqueUser);

      const res = await get<ChangeRequestListResponse>(
        `/change-requests?requestedBy=${encodeURIComponent(uniqueUser)}`,
      );

      expect(res.status).toBe(200);
      expect(res.body.total).toBe(1);
      expect(res.body.items[0]!.id).toBe(cr.id);
    });

    it('returns 400 for an invalid status filter value', async () => {
      const res = await get<ApiErrorResponse>('/change-requests?status=NONSENSE');
      expect(res.status).toBe(400);
    });
  });

  // ─── GET /change-requests/:id ────────────────────────────────────────────

  describe('GET /change-requests/:id', () => {
    it('returns the change request by ID', async () => {
      const cr = await createDraftCr();

      const res = await get<ChangeRequestResponse>(`/change-requests/${cr.id}`);

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(cr.id);
    });

    it('returns 404 for a non-existent UUID', async () => {
      const res = await get<ApiErrorResponse>(`/change-requests/${randomUUID()}`);
      expect(res.status).toBe(404);
    });

    it('returns 400 for a non-UUID id param', async () => {
      const res = await get<ApiErrorResponse>('/change-requests/not-a-uuid');
      expect(res.status).toBe(400);
    });
  });

  // ─── State machine lifecycle ─────────────────────────────────────────────

  describe('POST /change-requests/:id/submit', () => {
    it('transitions DRAFT → SUBMITTED', async () => {
      const cr = await createDraftCr();

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/submit`,
        {},
        { 'x-user-id': 'submitter' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.SUBMITTED);
    });

    it('returns 400 when submitting an already-SUBMITTED request', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });

      const res = await post<ApiErrorResponse>(
        `/change-requests/${cr.id}/submit`,
        {},
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(400);
      expect(String(res.body.message)).toMatch(/Cannot perform "submit"/);
    });
  });

  describe('POST /change-requests/:id/request-approval', () => {
    it('transitions SUBMITTED → PENDING_APPROVAL', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/request-approval`,
        {},
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.PENDING_APPROVAL);
    });

    it('returns 400 when requesting approval on a DRAFT request', async () => {
      const cr = await createDraftCr();

      const res = await post<ApiErrorResponse>(
        `/change-requests/${cr.id}/request-approval`,
        {},
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(400);
    });
  });

  // ─── Approval decisions ──────────────────────────────────────────────────

  describe('POST /change-requests/:id/decisions', () => {
    it('records curator approval (status stays PENDING_APPROVAL)', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED, comment: 'Looks good' },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );

      expect(res.status).toBe(200);
      // After curator approval alone the CR stays PENDING_APPROVAL
      expect(res.body.status).toBe(ChangeRequestStatus.PENDING_APPROVAL);
      expect(res.body.approvalDecisions).toHaveLength(1);
      expect(res.body.approvalDecisions[0]).toMatchObject({
        approverRole: CURATOR_ROLE,
        decision: ApprovalDecisionOutcome.APPROVED,
        comment: 'Looks good',
      });
    });

    it('moves to APPROVED after governance-board also approves', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'gb-user', 'x-user-role': GOVERNANCE_BOARD_ROLE },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.APPROVED);
      expect(res.body.approvalDecisions).toHaveLength(2);
    });

    it('allows admin to record the curator-stage approval', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED, comment: 'Admin stepping in' },
        { 'x-user-id': 'admin-user', 'x-user-role': 'admin' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.PENDING_APPROVAL);
      expect(res.body.approvalDecisions).toHaveLength(1);
      expect(res.body.approvalDecisions[0]).toMatchObject({
        approverRole: CURATOR_ROLE,
        approverId: 'admin-user',
        decision: ApprovalDecisionOutcome.APPROVED,
      });
    });

    it('allows admin to record the governance-board stage after curator approval', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'admin-user', 'x-user-role': 'admin' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.APPROVED);
      expect(res.body.approvalDecisions).toHaveLength(2);
      expect(res.body.approvalDecisions[1]).toMatchObject({
        approverRole: GOVERNANCE_BOARD_ROLE,
        approverId: 'admin-user',
        decision: ApprovalDecisionOutcome.APPROVED,
      });
    });

    it('moves to REJECTED when curator rejects', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.REJECTED, comment: 'Rationale unclear' },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.REJECTED);
    });

    it('returns 403 when governance-board acts before curator', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });

      const res = await post<ApiErrorResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'gb-user', 'x-user-role': GOVERNANCE_BOARD_ROLE },
      );

      expect(res.status).toBe(403);
    });

    it('returns 409 on duplicate decision from the same role', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );

      // Second curator attempt
      const res = await post<ApiErrorResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'curator-2', 'x-user-role': CURATOR_ROLE },
      );

      expect(res.status).toBe(409);
    });

    it('returns 400 when decision payload is invalid', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });

      const res = await post<ApiErrorResponse>(
        `/change-requests/${cr.id}/decisions`,
        { decision: 'MAYBE' },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );

      expect(res.status).toBe(400);
    });
  });

  // ─── Execute / complete / fail ───────────────────────────────────────────

  describe('POST /change-requests/:id/execute', () => {
    it('transitions APPROVED → EXECUTING and creates capability locks', async () => {
      const cr = await createDraftCr([capId1, capId2]);
      await advanceToStatus(cr.id, ChangeRequestStatus.APPROVED, [capId1, capId2]);

      let res: { status: number; body: ChangeRequestResponse } | undefined;

      try {
        res = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/execute`,
          {},
          { 'x-user-id': 'executor' },
        );

        expect(res.status).toBe(200);
        expect(res.body.status).toBe(ChangeRequestStatus.EXECUTING);

        const locks = await prisma.capabilityLock.findMany({
          where: { changeRequestId: cr.id },
        });
        expect(locks).toHaveLength(2);
        expect(locks.map((l) => l.capabilityId).sort()).toEqual([capId1, capId2].sort());
      } finally {
        // Always release locks so capabilities aren't locked for subsequent tests
        await prisma.capabilityLock.deleteMany({ where: { changeRequestId: cr.id } });
        await prisma.changeRequest.updateMany({
          where: { id: cr.id, status: { not: ChangeRequestStatus.COMPLETED } },
          data: { status: ChangeRequestStatus.COMPLETED },
        });
      }
    });

    it('returns 409 when a capability is already locked by another CR', async () => {
      // Pre-create a lock on capId2 from a "competing" CR
      const lockingCr = await prisma.changeRequest.create({
        data: {
          type: ChangeRequestType.UPDATE,
          status: ChangeRequestStatus.EXECUTING,
          requestedBy: 'locker',
          rationale: 'Holds the lock',
          affectedCapabilityIds: [capId2],
        },
      });
      await prisma.capabilityLock.create({
        data: {
          capabilityId: capId2,
          changeRequestId: lockingCr.id,
          lockedBy: 'locker',
        },
      });

      try {
        // Try to execute a CR that also affects capId2
        const cr = await createDraftCr([capId2]);
        await advanceToStatus(cr.id, ChangeRequestStatus.APPROVED, [capId2]);

        const res = await post<ApiErrorResponse>(
          `/change-requests/${cr.id}/execute`,
          {},
          { 'x-user-id': 'executor' },
        );

        expect(res.status).toBe(409);
      } finally {
        await prisma.capabilityLock.deleteMany({ where: { changeRequestId: lockingCr.id } });
        await prisma.changeRequest.delete({ where: { id: lockingCr.id } });
      }
    });
  });

  describe('POST /change-requests/:id/complete', () => {
    it('transitions EXECUTING → COMPLETED and releases locks', async () => {
      const cr = await createDraftCr([capId1]);
      const executing = await advanceToStatus(cr.id, ChangeRequestStatus.EXECUTING, [capId1]);
      expect(executing.status).toBe(ChangeRequestStatus.EXECUTING);

      const locksBefore = await prisma.capabilityLock.findMany({
        where: { changeRequestId: cr.id },
      });
      expect(locksBefore).toHaveLength(1);

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/complete`,
        {},
        { 'x-user-id': 'executor' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.COMPLETED);

      const locksAfter = await prisma.capabilityLock.findMany({
        where: { changeRequestId: cr.id },
      });
      expect(locksAfter).toHaveLength(0);
    });
  });

  describe('POST /change-requests/:id/fail', () => {
    it('rolls back EXECUTING → APPROVED and releases locks', async () => {
      const cr = await createDraftCr([capId1]);
      await advanceToStatus(cr.id, ChangeRequestStatus.EXECUTING, [capId1]);

      const locksBeforeFail = await prisma.capabilityLock.findMany({
        where: { changeRequestId: cr.id },
      });
      expect(locksBeforeFail).toHaveLength(1);

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/fail`,
        { comment: 'DB timeout during migration' },
        { 'x-user-id': 'executor' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.APPROVED);

      const locksAfterFail = await prisma.capabilityLock.findMany({
        where: { changeRequestId: cr.id },
      });
      expect(locksAfterFail).toHaveLength(0);

      // Verify audit entry records the failure
      const latest = res.body.auditEntries.at(-1);
      expect(latest?.eventType).toBe('EXECUTION_FAILED');
      expect(latest?.comment).toBe('DB timeout during migration');

      // Clean up — mark as completed so caps stay unlocked
      await prisma.changeRequest.update({
        where: { id: cr.id },
        data: { status: ChangeRequestStatus.COMPLETED },
      });
    });
  });

  describe('POST /change-requests/:id/cancel', () => {
    it('cancels a DRAFT change request', async () => {
      const cr = await createDraftCr();

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/cancel`,
        { comment: 'No longer needed' },
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.CANCELLED);
    });

    it('cancels a SUBMITTED change request', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });

      const res = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/cancel`,
        {},
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(200);
      expect(res.body.status).toBe(ChangeRequestStatus.CANCELLED);
    });

    it('returns 400 when trying to cancel a PENDING_APPROVAL request', async () => {
      const cr = await createDraftCr();
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });

      const res = await post<ApiErrorResponse>(
        `/change-requests/${cr.id}/cancel`,
        {},
        { 'x-user-id': 'u1' },
      );

      expect(res.status).toBe(400);
    });
  });

  // ─── GET /capabilities/:id/change-requests ───────────────────────────────

  describe('GET /capabilities/:capabilityId/change-requests', () => {
    it('returns active change requests affecting the capability', async () => {
      const cr = await createDraftCr([capId1]);

      const res = await get<ChangeRequestListResponse>(
        `/capabilities/${capId1}/change-requests`,
      );

      expect(res.status).toBe(200);
      const found = res.body.items.find((item) => item.id === cr.id);
      expect(found).toBeDefined();
    });

    it('does not return COMPLETED change requests', async () => {
      const cr = await createDraftCr([capId1]);
      await advanceToStatus(cr.id, ChangeRequestStatus.COMPLETED, [capId1]);

      const res = await get<ChangeRequestListResponse>(
        `/capabilities/${capId1}/change-requests`,
      );

      expect(res.status).toBe(200);
      const found = res.body.items.find((item) => item.id === cr.id);
      expect(found).toBeUndefined();
    });

    it('does not return CANCELLED change requests', async () => {
      const cr = await createDraftCr([capId1]);
      await post(`/change-requests/${cr.id}/cancel`, {}, { 'x-user-id': 'u1' });

      const res = await get<ChangeRequestListResponse>(
        `/capabilities/${capId1}/change-requests`,
      );

      expect(res.status).toBe(200);
      const found = res.body.items.find((item) => item.id === cr.id);
      expect(found).toBeUndefined();
    });

    it('returns 400 for a non-UUID capability ID', async () => {
      const res = await get<ApiErrorResponse>('/capabilities/not-a-uuid/change-requests');
      expect(res.status).toBe(400);
    });
  });

  // ─── Full lifecycle audit trail ──────────────────────────────────────────
  // ─── POST /change-requests/:id/apply (structural operations) ─────────────

  describe('POST /change-requests/:id/apply', () => {
    /**
     * Create a structural CR, advance it to EXECUTING, and return the CR.
     * Caller must clean up the capability and CR (and locks) in a finally block.
     */
    async function createStructuralCrAndExecute(
      type: ChangeRequestType,
      affectedCapabilityIds: string[],
      operationPayload?: Record<string, unknown>,
      crExtraFields?: Record<string, unknown>,
    ): Promise<ChangeRequestResponse> {
      const res = await post<ChangeRequestResponse>(
        '/change-requests',
        {
          type,
          rationale: `Integration test – ${type}`,
          affectedCapabilityIds,
          ...(operationPayload ? { operationPayload } : {}),
          ...(crExtraFields ?? {}),
        },
        { 'x-user-id': 'test-user' },
      );
      expect(res.status).toBe(201);
      const cr = res.body;

      // DRAFT → SUBMITTED → PENDING_APPROVAL → (curator + gb approve) → APPROVED → EXECUTING
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'test-user' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'test-user' });
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'gb-user', 'x-user-role': GOVERNANCE_BOARD_ROLE },
      );
      const execRes = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/execute`,
        {},
        { 'x-user-id': 'test-user' },
      );
      expect(execRes.status).toBe(200);
      expect(execRes.body.status).toBe(ChangeRequestStatus.EXECUTING);
      return execRes.body;
    }

    it('PROMOTE: promotes a LEAF capability to ABSTRACT and transitions CR to COMPLETED', async () => {
      const suffix = randomUUID();
      const cap = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-promote-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(ChangeRequestType.PROMOTE, [cap.id]);

        const applyRes = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'test-user' },
        );

        expect(applyRes.status).toBe(200);
        expect(applyRes.body.status).toBe(ChangeRequestStatus.COMPLETED);

        // Capability must be ABSTRACT now
        const updated = await prisma.capability.findUniqueOrThrow({ where: { id: cap.id } });
        expect(updated.type).toBe(PrismaCapabilityType.ABSTRACT);

        // Locks must be released
        const locks = await prisma.capabilityLock.findMany({ where: { changeRequestId: cr.id } });
        expect(locks).toHaveLength(0);

        // Audit trail must include STRUCTURAL_OPERATION_APPLIED
        const audit = applyRes.body.auditEntries.map((e) => e.eventType);
        expect(audit).toContain('STRUCTURAL_OPERATION_APPLIED');
      } finally {
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capability.deleteMany({ where: { id: cap.id } });
      }
    });

    it('DEMOTE: demotes an ABSTRACT capability with no children to LEAF',async () => {
      const suffix = randomUUID();
      const cap = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-demote-${suffix}`,
          type: PrismaCapabilityType.ABSTRACT,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(ChangeRequestType.DEMOTE, [cap.id]);

        const applyRes = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'test-user' },
        );

        expect(applyRes.status).toBe(200);
        expect(applyRes.body.status).toBe(ChangeRequestStatus.COMPLETED);

        const updated = await prisma.capability.findUniqueOrThrow({ where: { id: cap.id } });
        expect(updated.type).toBe(PrismaCapabilityType.LEAF);
      } finally {
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capability.deleteMany({ where: { id: cap.id } });
      }
    });

    it('REPARENT: moves a capability under a new parent',async () => {
      const suffix = randomUUID();
      const parent = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-reparent-parent-${suffix}`,
          type: PrismaCapabilityType.ABSTRACT,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });
      const child = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-reparent-child-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(
          ChangeRequestType.REPARENT,
          [child.id],
          { newParentId: parent.id },
        );

        const applyRes = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'test-user' },
        );

        expect(applyRes.status).toBe(200);
        expect(applyRes.body.status).toBe(ChangeRequestStatus.COMPLETED);

        const updated = await prisma.capability.findUniqueOrThrow({ where: { id: child.id } });
        expect(updated.parentId).toBe(parent.id);
      } finally {
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: { in: [parent.id, child.id] } } });
        await prisma.capability.deleteMany({ where: { id: { in: [parent.id, child.id] } } });
      }
    });

    it('DELETE: hard-deletes a DRAFT capabilityand transitions CR to COMPLETED', async () => {
      const suffix = randomUUID();
      const cap = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-delete-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.DRAFT,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(ChangeRequestType.DELETE, [cap.id]);

        const applyRes = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'test-user' },
        );

        expect(applyRes.status).toBe(200);
        expect(applyRes.body.status).toBe(ChangeRequestStatus.COMPLETED);

        // Capability must no longer exist
        const gone = await prisma.capability.findUnique({ where: { id: cap.id } });
        expect(gone).toBeNull();
      } finally {
        // Cap already deleted by the operation — ignore if missing
        await prisma.capability.deleteMany({ where: { id: cap.id } });
      }
    });

    it('RETIRE: retires a capability and flags its active mappings as INACTIVE', async () => {
      const suffix = randomUUID();
      const cap = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-retire-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });
      const mapping = await prisma.mapping.create({
        data: {
          mappingType: 'SYSTEM',
          systemId: `sys-retire-${suffix}`,
          capabilityId: cap.id,
          state: PrismaMappingState.ACTIVE,
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(
          ChangeRequestType.RETIRE,
          [cap.id],
          undefined,
          { downstreamPlan: 'Decommission all downstream consumers of the retired capability.' },
        );

        const applyRes = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'test-user' },
        );

        expect(applyRes.status).toBe(200);
        expect(applyRes.body.status).toBe(ChangeRequestStatus.COMPLETED);

        const updated = await prisma.capability.findUniqueOrThrow({ where: { id: cap.id } });
        expect(updated.lifecycleStatus).toBe(PrismaLifecycleStatus.RETIRED);

        // The active mapping must have been flagged INACTIVE by the retire operation
        const updatedMapping = await prisma.mapping.findUniqueOrThrow({ where: { id: mapping.id } });
        expect(updatedMapping.state).toBe(PrismaMappingState.INACTIVE);
      } finally {
        // Delete mapping first (FK: mapping → capability), then capability version, then capability
        await prisma.mapping.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capability.deleteMany({ where: { id: cap.id } });
      }
    });

    it('MERGE: retires source capabilityand merges metadata into survivor', async () => {
      const suffix = randomUUID();
      const survivor = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-merge-survivor-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: ['alias-survivor'],
          tags: [],
          sourceReferences: [],
        },
      });
      const source = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-merge-source-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: ['alias-source'],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(
          ChangeRequestType.MERGE,
          [survivor.id, source.id],
          { survivorCapabilityId: survivor.id },
        );

        const applyRes = await post<ChangeRequestResponse>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'test-user' },
        );

        expect(applyRes.status).toBe(200);
        expect(applyRes.body.status).toBe(ChangeRequestStatus.COMPLETED);

        // Source must be RETIRED
        const retiredSource = await prisma.capability.findUniqueOrThrow({ where: { id: source.id } });
        expect(retiredSource.lifecycleStatus).toBe(PrismaLifecycleStatus.RETIRED);

        // Survivor must have merged aliases
        const updatedSurvivor = await prisma.capability.findUniqueOrThrow({ where: { id: survivor.id } });
        expect(updatedSurvivor.aliases).toEqual(expect.arrayContaining(['alias-survivor', 'alias-source']));
      } finally {
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: { in: [survivor.id, source.id] } } });
        await prisma.capability.deleteMany({ where: { id: { in: [survivor.id, source.id] } } });
      }
    });

    it('returns 400 when /apply is called on a non-structural CR type (UPDATE)',async () => {
      const cr = await createDraftCr([capId1]);
      // Advance to EXECUTING
      await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
      await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
      );
      await post(
        `/change-requests/${cr.id}/decisions`,
        { decision: ApprovalDecisionOutcome.APPROVED },
        { 'x-user-id': 'gb-user', 'x-user-role': GOVERNANCE_BOARD_ROLE },
      );
      const execRes = await post<ChangeRequestResponse>(
        `/change-requests/${cr.id}/execute`,
        {},
        { 'x-user-id': 'u1' },
      );
      expect(execRes.status).toBe(200);

      try {
        const applyRes = await post<{ statusCode: number; message: string }>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'u1' },
        );
        expect(applyRes.status).toBe(400);
      } finally {
        await prisma.capabilityLock.deleteMany({ where: { changeRequestId: cr.id } });
        await prisma.changeRequest.updateMany({
          where: { id: cr.id },
          data: { status: ChangeRequestStatus.COMPLETED },
        });
      }
    });

    it('returns 400 when /apply is called before /execute (CR is APPROVED, not EXECUTING)', async () => {
      const suffix = randomUUID();
      const cap = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-not-executing-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const crRes = await post<ChangeRequestResponse>(
          '/change-requests',
          { type: ChangeRequestType.PROMOTE, rationale: 'test', affectedCapabilityIds: [cap.id] },
          { 'x-user-id': 'u1' },
        );
        const cr = crRes.body;
        await post(`/change-requests/${cr.id}/submit`, {}, { 'x-user-id': 'u1' });
        await post(`/change-requests/${cr.id}/request-approval`, {}, { 'x-user-id': 'u1' });
        await post(
          `/change-requests/${cr.id}/decisions`,
          { decision: ApprovalDecisionOutcome.APPROVED },
          { 'x-user-id': 'curator', 'x-user-role': CURATOR_ROLE },
        );
        await post(
          `/change-requests/${cr.id}/decisions`,
          { decision: ApprovalDecisionOutcome.APPROVED },
          { 'x-user-id': 'gb-user', 'x-user-role': GOVERNANCE_BOARD_ROLE },
        );
        // CR is now APPROVED but not yet EXECUTING — /apply should reject

        const applyRes = await post<{ statusCode: number }>(
          `/change-requests/${cr.id}/apply`,
          {},
          { 'x-user-id': 'u1' },
        );
        expect(applyRes.status).toBe(400);
      } finally {
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capability.deleteMany({ where: { id: cap.id } });
      }
    });

    it('returns 400 when /complete is called on a structural CR type (must use /apply)', async () => {
      const suffix = randomUUID();
      const cap = await prisma.capability.create({
        data: {
          uniqueName: `apply-it-complete-guard-${suffix}`,
          type: PrismaCapabilityType.LEAF,
          lifecycleStatus: PrismaLifecycleStatus.ACTIVE,
          aliases: [],
          tags: [],
          sourceReferences: [],
        },
      });

      try {
        const cr = await createStructuralCrAndExecute(ChangeRequestType.PROMOTE, [cap.id]);

        // /complete must reject structural types
        const completeRes = await post<{ statusCode: number; message: string }>(
          `/change-requests/${cr.id}/complete`,
          {},
          { 'x-user-id': 'u1' },
        );
        expect(completeRes.status).toBe(400);
        expect(String(completeRes.body.message)).toMatch(/structural operation/i);
      } finally {
        await prisma.capabilityLock.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capabilityVersion.deleteMany({ where: { capabilityId: cap.id } });
        await prisma.capability.deleteMany({ where: { id: cap.id } });
      }
    });
  });

  // ─── Full lifecycle audit trail ──────────────────────────────────────────

  describe('full lifecycle audit trail', () => {
    it('records an immutable audit entry for every state transition', async () => {
      const cr = await createDraftCr([capId1]);
      const completed = await advanceToStatus(cr.id, ChangeRequestStatus.COMPLETED, [capId1]);

      const eventTypes = completed.auditEntries.map((e) => e.eventType);
      expect(eventTypes).toContain('CREATED');
      expect(eventTypes).toContain('SUBMITTED');
      expect(eventTypes).toContain('PENDING_APPROVAL');
      expect(eventTypes).toContain('CURATOR_APPROVED');
      expect(eventTypes).toContain('APPROVED');
      expect(eventTypes).toContain('EXECUTION_STARTED');
      expect(eventTypes).toContain('EXECUTION_COMPLETED');
      // Entries should be in chronological order
      expect(completed.auditEntries.length).toBeGreaterThanOrEqual(7);
    });
  });
});
