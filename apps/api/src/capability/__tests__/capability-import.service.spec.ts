import { Test, type TestingModule } from '@nestjs/testing';
import { PrismaService } from '../../prisma/prisma.service';
import { NameGuardrailService } from '../name-guardrail.service';
import { CapabilityImportFormat } from '../dto/import-capabilities.dto';
import { CapabilityImportService } from '../capability-import.service';
import { CapabilityService } from '../capability.service';

const transactionClient = {
  auditEntry: {
    create: jest.fn(),
  },
};

const mockPrismaService = {
  $transaction: jest
    .fn()
    .mockImplementation(async (fn: (tx: typeof transactionClient) => Promise<unknown>) =>
      fn(transactionClient),
    ),
  capability: {
    findMany: jest.fn(),
  },
};

const mockCapabilityService = {
  create: jest.fn(),
};

const mockNameGuardrailService = {
  evaluateName: jest.fn().mockReturnValue({
    flagged: false,
    matchedTerms: [],
    warning: null,
  }),
};

describe('CapabilityImportService', () => {
  let service: CapabilityImportService;
  let prisma: typeof mockPrismaService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        CapabilityImportService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: CapabilityService, useValue: mockCapabilityService },
        { provide: NameGuardrailService, useValue: mockNameGuardrailService },
      ],
    }).compile();

    service = module.get(CapabilityImportService);
    prisma = module.get(PrismaService);

    jest.resetAllMocks();

    mockPrismaService.$transaction.mockImplementation(
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      async (fn: (tx: any) => Promise<unknown>) => fn(transactionClient),
    );
    mockNameGuardrailService.evaluateName.mockReturnValue({
      flagged: false,
      matchedTerms: [],
      warning: null,
    });
  });

  it('returns a dry-run summary without creating capabilities', async () => {
    prisma.capability.findMany.mockResolvedValue([]);

    const result = await service.dryRun({
      format: CapabilityImportFormat.CSV,
      csvContent: 'uniqueName,parentUniqueName\nPayments,\nCards,Payments',
    });

    expect(result.canCommit).toBe(true);
    expect(result.summary).toEqual({
      totalRows: 2,
      readyCount: 2,
      invalidRows: 0,
      createdCount: 0,
    });
    expect(result.rows).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        uniqueName: 'Payments',
        action: 'CREATE',
        type: 'ABSTRACT',
      }),
      expect.objectContaining({
        rowNumber: 3,
        uniqueName: 'Cards',
        parentUniqueName: 'Payments',
        type: 'LEAF',
      }),
    ]);
    expect(mockCapabilityService.create).not.toHaveBeenCalled();
  });

  it('blocks commit when validation errors exist', async () => {
    prisma.capability.findMany.mockResolvedValue([]);

    await expect(
      service.commit(
        {
          format: CapabilityImportFormat.CSV,
          csvContent: 'uniqueName,parentUniqueName\nPayments,Payments',
        },
        'user-1',
      ),
    ).rejects.toMatchObject({
      response: expect.objectContaining({
        message: 'Capability import validation failed',
        errors: [
          expect.objectContaining({
            rowNumber: 2,
            field: 'parentUniqueName',
            code: 'INVALID_PARENT',
          }),
        ],
      }),
    });

    expect(prisma.$transaction).not.toHaveBeenCalled();
    expect(mockCapabilityService.create).not.toHaveBeenCalled();
  });

  it('creates capabilities in parent-first order and records audit entries', async () => {
    prisma.capability.findMany.mockResolvedValue([]);
    mockCapabilityService.create
      .mockResolvedValueOnce({
        id: 'cap-parent',
        uniqueName: 'Payments',
      })
      .mockResolvedValueOnce({
        id: 'cap-child',
        uniqueName: 'Cards',
      });

    const result = await service.commit(
      {
        format: CapabilityImportFormat.CSV,
        csvContent: 'uniqueName,parentUniqueName\nCards,Payments\nPayments,',
      },
      'user-2',
    );

    expect(result.summary.createdCount).toBe(2);
    expect(mockCapabilityService.create).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        uniqueName: 'Payments',
        parentId: undefined,
        type: 'ABSTRACT',
      }),
      expect.objectContaining({
        tx: transactionClient,
        actorId: 'user-2',
      }),
    );
    expect(mockCapabilityService.create).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        uniqueName: 'Cards',
        parentId: 'cap-parent',
      }),
      expect.objectContaining({
        tx: transactionClient,
        actorId: 'user-2',
      }),
    );
    expect(transactionClient.auditEntry.create).toHaveBeenCalledTimes(2);
    expect(result.created).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        capabilityId: 'cap-parent',
        uniqueName: 'Payments',
      }),
      expect.objectContaining({
        rowNumber: 2,
        capabilityId: 'cap-child',
        uniqueName: 'Cards',
        parentUniqueName: 'Payments',
      }),
    ]);
  });

  it('reports existing-name conflicts for the create-only slice', async () => {
    prisma.capability.findMany
      .mockResolvedValueOnce([{ id: 'existing-capability', uniqueName: 'Payments' }])
      .mockResolvedValueOnce([]);

    const result = await service.dryRun({
      format: CapabilityImportFormat.CSV,
      csvContent: 'uniqueName\nPayments',
    });

    expect(result.canCommit).toBe(false);
    expect(result.errors).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'uniqueName',
        code: 'EXISTING_CONFLICT',
      }),
    ]);
  });

  it('surfaces guardrail warnings without blocking the import', async () => {
    prisma.capability.findMany.mockResolvedValue([]);
    mockNameGuardrailService.evaluateName.mockReturnValue({
      flagged: true,
      matchedTerms: ['salesforce'],
      warning: {
        code: 'CAPABILITY_NAME_GUARDRAIL',
        message:
          'Capability name may describe a tool, vendor, or product instead of the intended business capability: salesforce',
        matchedTerms: ['salesforce'],
        overrideApplied: false,
        overrideRationale: null,
      },
    });

    const result = await service.dryRun({
      format: CapabilityImportFormat.CSV,
      csvContent: 'uniqueName\nSalesforce workflow orchestration',
    });

    expect(result.canCommit).toBe(true);
    expect(result.warnings).toEqual([
      expect.objectContaining({
        rowNumber: 2,
        field: 'uniqueName',
        code: 'CAPABILITY_NAME_GUARDRAIL',
        matchedTerms: ['salesforce'],
      }),
    ]);
  });

  it('preserves original CSV row numbers when blank lines are present', async () => {
    prisma.capability.findMany.mockResolvedValue([]);

    const result = await service.dryRun({
      format: CapabilityImportFormat.CSV,
      csvContent: 'uniqueName\n\nPayments',
    });

    expect(result.rows).toEqual([
      expect.objectContaining({
        rowNumber: 3,
        uniqueName: 'Payments',
      }),
    ]);
  });
});
