import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { config as loadDotEnv } from 'dotenv';
import * as bcrypt from 'bcrypt';
import {
  CapabilityType,
  HealthStatus,
  LifecycleStatus,
  MappingState,
  PrismaClient,
  UserRole,
  type Prisma,
} from '@prisma/client';

function loadEnvironment(): void {
  const candidatePaths = [resolve(process.cwd(), '.env'), resolve(process.cwd(), '../../.env')];

  for (const envPath of candidatePaths) {
    if (existsSync(envPath)) {
      loadDotEnv({ path: envPath, override: false });
    }
  }
}

function parseBoolean(value: string | undefined): boolean {
  if (!value) {
    return false;
  }

  return ['1', 'true', 'yes', 'on'].includes(value.trim().toLowerCase());
}

loadEnvironment();

interface SeedCapabilityDefinition {
  id: string;
  key: string;
  uniqueName: string;
  aliases: string[];
  description: string;
  domain: string;
  type: CapabilityType;
  parentKey?: string;
  lifecycleStatus: LifecycleStatus;
  rationale?: string;
  sourceReferences: string[];
  tags: string[];
  stewardId: string;
  stewardDepartment: string;
  effectiveFrom: Date;
}

interface SeedMappingDefinition {
  id: string;
  capabilityKey: string;
  mappingType: string;
  systemId: string;
  state: MappingState;
  attributes?: Prisma.InputJsonValue;
}

interface SeedDownstreamConsumerDefinition {
  id: string;
  name: string;
  contractType: string;
  syncMode: string;
  transformationProfile: string | null;
  healthStatus: HealthStatus;
}

const BCRYPT_ROUNDS = 12;
const effectiveFrom = new Date('2026-01-01T00:00:00.000Z');
const sourceReference = 'ECM curated local demo dataset';
const demoAdminUser = {
  id: '00000000-0000-0000-0000-000000000201',
  displayName: 'ECM Platform Administrator',
  role: UserRole.ADMIN,
} as const;

const seedCapabilities: SeedCapabilityDefinition[] = [
  {
    id: '00000000-0000-0000-0000-000000000101',
    key: 'enterprise-operations',
    uniqueName: 'Enterprise Operations',
    aliases: ['Core Operations'],
    description:
      'Coordinates enterprise planning, financial control, and supplier-facing operating capabilities.',
    domain: 'Enterprise Operations',
    type: CapabilityType.ABSTRACT,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale:
      'Provides a stable top-level operating domain for local development and demo scenarios.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'operations', 'enterprise'],
    stewardId: 'steward.enterprise-operations@ecm.local',
    stewardDepartment: 'Enterprise Operations Stewardship',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000102',
    key: 'customer-management',
    uniqueName: 'Customer Management',
    aliases: ['Customer Engagement'],
    description:
      'Provides commercial and service capabilities that shape how the enterprise acquires and supports customers.',
    domain: 'Customer Management',
    type: CapabilityType.ABSTRACT,
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Provides a second top-level operating domain for realistic hierarchy navigation.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'customer', 'commercial'],
    stewardId: 'steward.customer-management@ecm.local',
    stewardDepartment: 'Customer Management Stewardship',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000103',
    key: 'finance-management',
    uniqueName: 'Finance Management',
    aliases: ['Finance Operations'],
    description:
      'Stewards policies and workflows for financial processing, reconciliation, and reporting operations.',
    domain: 'Enterprise Operations',
    type: CapabilityType.ABSTRACT,
    parentKey: 'enterprise-operations',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Supports realistic finance stewardship scenarios under Enterprise Operations.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'finance'],
    stewardId: 'steward.finance-management@ecm.local',
    stewardDepartment: 'Finance Stewardship Office',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000104',
    key: 'supplier-management',
    uniqueName: 'Supplier Management',
    aliases: ['Vendor Management'],
    description:
      'Coordinates supplier lifecycle governance, performance oversight, and policy adherence activities.',
    domain: 'Enterprise Operations',
    type: CapabilityType.ABSTRACT,
    parentKey: 'enterprise-operations',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Supports procurement and third-party governance examples in development data.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'supplier'],
    stewardId: 'steward.supplier-management@ecm.local',
    stewardDepartment: 'Supplier Stewardship Office',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000105',
    key: 'sales-enablement',
    uniqueName: 'Sales Enablement',
    aliases: ['Commercial Enablement'],
    description:
      'Organizes commercial execution capabilities that support opportunity progression and offer preparation.',
    domain: 'Customer Management',
    type: CapabilityType.ABSTRACT,
    parentKey: 'customer-management',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Provides a realistic commercial branch for downstream CRUD validation.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'sales'],
    stewardId: 'steward.sales-enablement@ecm.local',
    stewardDepartment: 'Commercial Excellence',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000106',
    key: 'service-operations',
    uniqueName: 'Service Operations',
    aliases: ['Client Service Operations'],
    description:
      'Stewards customer support delivery capabilities for resolving cases and maintaining reusable knowledge.',
    domain: 'Customer Management',
    type: CapabilityType.ABSTRACT,
    parentKey: 'customer-management',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Creates a realistic service branch for breadcrumb and subtree testing.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'service'],
    stewardId: 'steward.service-operations@ecm.local',
    stewardDepartment: 'Client Service Stewardship',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000107',
    key: 'accounts-payable-processing',
    uniqueName: 'Accounts Payable Processing',
    aliases: ['AP Processing'],
    description:
      'Processes supplier invoices, validates approvals, and schedules outbound payment execution.',
    domain: 'Enterprise Operations',
    type: CapabilityType.LEAF,
    parentKey: 'finance-management',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Provides a finance leaf capability with common operational semantics.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'finance', 'payments'],
    stewardId: 'steward.ap-processing@ecm.local',
    stewardDepartment: 'Finance Stewardship Office',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000108',
    key: 'accounts-receivable-management',
    uniqueName: 'Accounts Receivable Management',
    aliases: ['AR Management'],
    description:
      'Issues customer invoices, tracks collections, and stewards receivables aging and dispute follow-up.',
    domain: 'Enterprise Operations',
    type: CapabilityType.LEAF,
    parentKey: 'finance-management',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Balances the finance branch with a customer-facing financial capability.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'finance', 'receivables'],
    stewardId: 'steward.ar-management@ecm.local',
    stewardDepartment: 'Finance Stewardship Office',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000109',
    key: 'supplier-onboarding',
    uniqueName: 'Supplier Onboarding',
    aliases: ['Vendor Onboarding'],
    description:
      'Validates new suppliers, gathers required due-diligence evidence, and activates them for sourcing.',
    domain: 'Enterprise Operations',
    type: CapabilityType.LEAF,
    parentKey: 'supplier-management',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Represents a common supplier lifecycle capability for hierarchy demos.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'supplier', 'onboarding'],
    stewardId: 'steward.supplier-onboarding@ecm.local',
    stewardDepartment: 'Supplier Stewardship Office',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000110',
    key: 'contract-compliance-monitoring',
    uniqueName: 'Contract Compliance Monitoring',
    aliases: ['Supplier Compliance Monitoring'],
    description:
      'Tracks supplier adherence to contract obligations, controls, and remediation commitments.',
    domain: 'Enterprise Operations',
    type: CapabilityType.LEAF,
    parentKey: 'supplier-management',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Adds a governance-oriented supplier capability with stewardship language.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'supplier', 'compliance'],
    stewardId: 'steward.contract-compliance@ecm.local',
    stewardDepartment: 'Supplier Stewardship Office',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000111',
    key: 'opportunity-management',
    uniqueName: 'Opportunity Management',
    aliases: ['Pipeline Management'],
    description:
      'Stewards opportunity qualification, progression criteria, and cross-functional pursuit coordination.',
    domain: 'Customer Management',
    type: CapabilityType.LEAF,
    parentKey: 'sales-enablement',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Provides a realistic commercial planning capability for sample data.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'sales', 'pipeline'],
    stewardId: 'steward.opportunity-management@ecm.local',
    stewardDepartment: 'Commercial Excellence',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000112',
    key: 'quote-management',
    uniqueName: 'Quote Management',
    aliases: ['Quotation Management'],
    description:
      'Coordinates commercial offer construction, pricing approvals, and quote issue readiness.',
    domain: 'Customer Management',
    type: CapabilityType.LEAF,
    parentKey: 'sales-enablement',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Creates a second sales leaf to exercise sibling traversal and listing queries.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'sales', 'pricing'],
    stewardId: 'steward.quote-management@ecm.local',
    stewardDepartment: 'Commercial Excellence',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000113',
    key: 'case-resolution',
    uniqueName: 'Case Resolution',
    aliases: ['Incident Resolution'],
    description:
      'Resolves customer issues through triage, coordinated fulfilment, and confirmation of service restoration.',
    domain: 'Customer Management',
    type: CapabilityType.LEAF,
    parentKey: 'service-operations',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Provides a service delivery leaf capability for realistic support workflows.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'service', 'support'],
    stewardId: 'steward.case-resolution@ecm.local',
    stewardDepartment: 'Client Service Stewardship',
    effectiveFrom,
  },
  {
    id: '00000000-0000-0000-0000-000000000114',
    key: 'knowledge-maintenance',
    uniqueName: 'Knowledge Maintenance',
    aliases: ['Knowledge Base Curation'],
    description:
      'Maintains reusable guidance, support content, and decision records that improve case handling quality.',
    domain: 'Customer Management',
    type: CapabilityType.LEAF,
    parentKey: 'service-operations',
    lifecycleStatus: LifecycleStatus.ACTIVE,
    rationale: 'Rounds out the service branch with a reusable knowledge capability.',
    sourceReferences: [sourceReference],
    tags: ['seed', 'service', 'knowledge'],
    stewardId: 'steward.knowledge-maintenance@ecm.local',
    stewardDepartment: 'Client Service Stewardship',
    effectiveFrom,
  },
];

const seedMappings: SeedMappingDefinition[] = [
  {
    id: '00000000-0000-0000-0000-000000000301',
    capabilityKey: 'accounts-payable-processing',
    mappingType: 'MANAGES',
    systemId: 'SAP-S4-FINANCE',
    state: MappingState.ACTIVE,
    attributes: {
      criticality: 'high',
      platform: 'SAP S/4HANA',
      region: 'Global',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000302',
    capabilityKey: 'accounts-receivable-management',
    mappingType: 'MANAGES',
    systemId: 'ORACLE-FUSION-ERP',
    state: MappingState.ACTIVE,
    attributes: {
      criticality: 'high',
      platform: 'Oracle Fusion',
      region: 'Global',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000303',
    capabilityKey: 'supplier-onboarding',
    mappingType: 'SUPPORTS',
    systemId: 'COUPA-SUPPLIER-PORTAL',
    state: MappingState.ACTIVE,
    attributes: {
      dataOwner: 'Procurement Operations',
      integrationMode: 'event-driven',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000304',
    capabilityKey: 'opportunity-management',
    mappingType: 'MANAGES',
    systemId: 'SALESFORCE-SALES-CLOUD',
    state: MappingState.ACTIVE,
    attributes: {
      businessUnit: 'Commercial',
      region: 'EMEA',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000305',
    capabilityKey: 'quote-management',
    mappingType: 'SUPPORTS',
    systemId: 'SALESFORCE-CPQ',
    state: MappingState.ACTIVE,
    attributes: {
      businessUnit: 'Commercial',
      integrationMode: 'batch',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000306',
    capabilityKey: 'case-resolution',
    mappingType: 'MANAGES',
    systemId: 'SERVICENOW-CSM',
    state: MappingState.ACTIVE,
    attributes: {
      supportTier: 'Tier 1-2',
      slaProfile: '24x7-critical',
    },
  },
  {
    id: '00000000-0000-0000-0000-000000000307',
    capabilityKey: 'knowledge-maintenance',
    mappingType: 'SUPPORTS',
    systemId: 'CONFLUENCE-KNOWLEDGE-HUB',
    state: MappingState.ACTIVE,
    attributes: {
      contentDomain: 'Customer Support',
      stewardingTeam: 'Knowledge Engineering',
    },
  },
];

const seedDownstreamConsumers: SeedDownstreamConsumerDefinition[] = [
  {
    id: '00000000-0000-0000-0000-000000000401',
    name: 'ServiceNow Capability Sync',
    contractType: 'published-model.v1',
    syncMode: 'EVENT_DRIVEN',
    transformationProfile: 'published-model-v1',
    healthStatus: HealthStatus.HEALTHY,
  },
  {
    id: '00000000-0000-0000-0000-000000000402',
    name: 'Enterprise Architecture Warehouse Export',
    contractType: 'published-model.v1',
    syncMode: 'NIGHTLY_BATCH',
    transformationProfile: 'published-model-v1',
    healthStatus: HealthStatus.HEALTHY,
  },
];

const prisma = new PrismaClient();

async function resetLocalDemoData(tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>): Promise<void> {
  await tx.taskOrNotification.deleteMany();
  await tx.auditEntry.deleteMany();
  await tx.publishEvent.deleteMany();
  await tx.capabilityLock.deleteMany();
  await tx.changeRequestAuditEntry.deleteMany();
  await tx.approvalDecision.deleteMany();
  await tx.changeRequest.deleteMany();
  await tx.mapping.deleteMany();
  await tx.capabilityVersion.deleteMany();
  await tx.capability.deleteMany();
  await tx.modelVersion.deleteMany();
  await tx.downstreamConsumer.deleteMany();
  await tx.user.deleteMany();
}

async function seedDemoAdminUser(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  email: string,
  passwordHash: string,
): Promise<void> {
  await tx.user.upsert({
    where: { email },
    update: {
      displayName: demoAdminUser.displayName,
      passwordHash,
      role: demoAdminUser.role,
      isActive: true,
    },
    create: {
      id: demoAdminUser.id,
      email,
      displayName: demoAdminUser.displayName,
      passwordHash,
      role: demoAdminUser.role,
      isActive: true,
    },
  });
}

async function seedCapabilityHierarchy(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
): Promise<Map<string, string>> {
  const capabilityIdsByKey = new Map<string, string>();

  for (const capability of seedCapabilities) {
    const parentId = capability.parentKey ? (capabilityIdsByKey.get(capability.parentKey) ?? null) : null;

    if (capability.parentKey && !parentId) {
      throw new Error(
        `Parent capability "${capability.parentKey}" must be seeded before "${capability.uniqueName}".`,
      );
    }

    const existingCapability =
      (await tx.capability.findUnique({
        where: { id: capability.id },
        select: { id: true },
      })) ??
      (await tx.capability.findUnique({
        where: { uniqueName: capability.uniqueName },
        select: { id: true },
      }));

    if (existingCapability) {
      capabilityIdsByKey.set(capability.key, existingCapability.id);
      continue;
    }

    const createdCapability = await tx.capability.create({
      data: {
        id: capability.id,
        uniqueName: capability.uniqueName,
        aliases: capability.aliases,
        description: capability.description,
        domain: capability.domain,
        type: capability.type,
        parentId,
        lifecycleStatus: capability.lifecycleStatus,
        effectiveFrom: capability.effectiveFrom,
        effectiveTo: null,
        rationale: capability.rationale,
        sourceReferences: capability.sourceReferences,
        tags: capability.tags,
        stewardId: capability.stewardId,
        stewardDepartment: capability.stewardDepartment,
      },
      select: { id: true },
    });

    capabilityIdsByKey.set(capability.key, createdCapability.id);
  }

  return capabilityIdsByKey;
}

async function seedMappingsForCapabilities(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
  capabilityIdsByKey: Map<string, string>,
): Promise<void> {
  for (const mapping of seedMappings) {
    const capabilityId = capabilityIdsByKey.get(mapping.capabilityKey);

    if (!capabilityId) {
      throw new Error(`Capability key "${mapping.capabilityKey}" was not resolved for demo mappings.`);
    }

    const existingMapping =
      (await tx.mapping.findUnique({
        where: { id: mapping.id },
        select: { id: true },
      })) ??
      (await tx.mapping.findFirst({
        where: {
          capabilityId,
          mappingType: mapping.mappingType,
          systemId: mapping.systemId,
        },
        select: { id: true },
      }));

    if (existingMapping) {
      continue;
    }

    await tx.mapping.create({
      data: {
        id: mapping.id,
        capabilityId,
        mappingType: mapping.mappingType,
        systemId: mapping.systemId,
        state: mapping.state,
        attributes: mapping.attributes,
      },
    });
  }
}

async function seedDownstreamConsumersCatalog(
  tx: Omit<PrismaClient, '$connect' | '$disconnect' | '$on' | '$transaction' | '$use' | '$extends'>,
): Promise<void> {
  for (const consumer of seedDownstreamConsumers) {
    const existingConsumer =
      (await tx.downstreamConsumer.findUnique({
        where: { id: consumer.id },
        select: { id: true },
      })) ??
      (await tx.downstreamConsumer.findUnique({
        where: { name: consumer.name },
        select: { id: true },
      }));

    if (existingConsumer) {
      continue;
    }

    await tx.downstreamConsumer.create({
      data: {
        id: consumer.id,
        name: consumer.name,
        contractType: consumer.contractType,
        syncMode: consumer.syncMode,
        transformationProfile: consumer.transformationProfile,
        healthStatus: consumer.healthStatus,
      },
    });
  }
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to run the Prisma seed script.');
  }

  const demoAdminEmail = (process.env.ECM_DEMO_ADMIN_EMAIL ?? 'admin@ecm.local').trim().toLowerCase();
  const demoAdminPassword = process.env.ECM_DEMO_ADMIN_PASSWORD ?? 'LocalDemo123!';
  const shouldResetDemoData = parseBoolean(process.env.ECM_RESET_DEMO_DATA);

  if (!demoAdminEmail) {
    throw new Error('ECM_DEMO_ADMIN_EMAIL must not be empty.');
  }

  if (!demoAdminPassword.trim()) {
    throw new Error('ECM_DEMO_ADMIN_PASSWORD must not be empty.');
  }

  if (shouldResetDemoData && process.env.NODE_ENV === 'production') {
    throw new Error('ECM_RESET_DEMO_DATA cannot be used when NODE_ENV=production.');
  }

  const passwordHash = await bcrypt.hash(demoAdminPassword, BCRYPT_ROUNDS);

  await prisma.$transaction(async (tx) => {
    if (shouldResetDemoData) {
      await resetLocalDemoData(tx);
    }

    await seedDemoAdminUser(tx, demoAdminEmail, passwordHash);

    const capabilityIdsByKey = await seedCapabilityHierarchy(tx);
    await seedMappingsForCapabilities(tx, capabilityIdsByKey);
    await seedDownstreamConsumersCatalog(tx);
  });

  const seededCapabilityCount = await prisma.capability.count({
    where: {
      uniqueName: {
        in: seedCapabilities.map(({ uniqueName }) => uniqueName),
      },
    },
  });

  const seededMappingCount = await prisma.mapping.count({
    where: {
      id: {
        in: seedMappings.map(({ id }) => id),
      },
    },
  });

  const seededConsumerCount = await prisma.downstreamConsumer.count({
    where: {
      name: {
        in: seedDownstreamConsumers.map(({ name }) => name),
      },
    },
  });

  const seededUserCount = await prisma.user.count({
    where: {
      email: demoAdminEmail,
    },
  });

  const totalCapabilityCount = await prisma.capability.count();

  if (shouldResetDemoData) {
    console.log('Reset existing local demo data before applying the curated bootstrap dataset.');
  }

  console.log(
    `Local demo bootstrap ready. Seeded ${seededCapabilityCount} capabilities, ${seededMappingCount} mappings, ${seededConsumerCount} downstream consumers, and ${seededUserCount} admin user. Total capabilities in database: ${totalCapabilityCount}.`,
  );
  console.log(`Use ${demoAdminEmail} to sign in to the local demo instance.`);
}

main()
  .catch((error: unknown) => {
    console.error('Capability seed failed.');
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
