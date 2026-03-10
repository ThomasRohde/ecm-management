import {
  BadRequestException,
  ConflictException,
  Injectable,
  InternalServerErrorException,
  NotFoundException,
} from '@nestjs/common';
import { Prisma } from '@prisma/client';
import type { Capability } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { LifecycleStatus } from './dto/create-capability.dto';
import type { CreateCapabilityDto } from './dto/create-capability.dto';
import type { UpdateCapabilityDto } from './dto/update-capability.dto';
import { ActiveLifecycleMetadataIncompleteException } from './exceptions/active-lifecycle-metadata-incomplete.exception';
import {
  NameGuardrailService,
  type CapabilityNameGuardrailWarning,
} from './name-guardrail.service';
import { CapabilityVersionService } from '../versioning/capability-version.service';

type ActiveLifecycleRequiredField =
  | 'description'
  | 'domain'
  | 'stewardId'
  | 'stewardDepartment';

interface ActiveLifecycleMetadataSnapshot {
  lifecycleStatus: string | null | undefined;
  description: string | null | undefined;
  domain: string | null | undefined;
  stewardId: string | null | undefined;
  stewardDepartment: string | null | undefined;
}

interface CapabilityWithGuardrailState {
  uniqueName: string;
  description: string | null;
  domain: string | null;
  lifecycleStatus: string;
  stewardId: string | null;
  stewardDepartment: string | null;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
}

const ACTIVE_LIFECYCLE_REQUIRED_FIELDS: ActiveLifecycleRequiredField[] = [
  'description',
  'domain',
  'stewardId',
  'stewardDepartment',
];

export interface CapabilitySearchParams {
  search?: string;
  domain?: string;
  lifecycleStatus?: string;
  type?: string;
  parentId?: string;
  tags?: string[];
  page?: number;
  limit?: number;
}

export interface CapabilitySubtreeNode extends Capability {
  children: CapabilitySubtreeNode[];
}

export interface CapabilityStewardship {
  capabilityId: string;
  stewardId: string | null;
  stewardDepartment: string | null;
  source: 'DIRECT' | 'INHERITED' | 'UNASSIGNED';
  sourceCapabilityId: string | null;
}

type CapabilityStewardshipRecord = Pick<
  Capability,
  | 'id'
  | 'parentId'
  | 'stewardId'
  | 'stewardDepartment'
>;

/** Default actor used until Phase 9 auth is wired in. */
const SYSTEM_ACTOR = 'system';

type CapabilityDatabaseClient = PrismaService | Prisma.TransactionClient;

interface CreateCapabilityOptions {
  tx?: Prisma.TransactionClient;
  actorId?: string;
}

@Injectable()
export class CapabilityService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly nameGuardrailService: NameGuardrailService,
    private readonly capabilityVersionService: CapabilityVersionService,
  ) {}

  async findAll(params: CapabilitySearchParams) {
    const { search, domain, lifecycleStatus, type, parentId, tags } = params;
    const page = this.normalizePositiveInteger(params.page, 1);
    const limit = this.normalizePositiveInteger(params.limit, 25);
    const normalizedSearch = search?.trim();

    // Always exclude branch-local capabilities from main reads.
    const where: Record<string, unknown> = { branchOriginId: null };

    if (normalizedSearch) {
      where.OR = [
        { uniqueName: { contains: normalizedSearch, mode: 'insensitive' } },
        { description: { contains: normalizedSearch, mode: 'insensitive' } },
        { aliases: { has: normalizedSearch } },
      ];
    }

    if (domain) where.domain = domain;
    if (lifecycleStatus) where.lifecycleStatus = lifecycleStatus;
    if (type) where.type = type;
    if (parentId) where.parentId = parentId;
    if (tags && tags.length > 0) where.tags = { hasEvery: tags };

    const [items, total] = await Promise.all([
      this.prisma.capability.findMany({
        where,
        skip: (page - 1) * limit,
        take: limit,
        orderBy: { uniqueName: 'asc' },
        include: { children: { select: { id: true } } },
      }),
      this.prisma.capability.count({ where }),
    ]);

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }

  async findOne(id: string) {
    const capability = await this.prisma.capability.findUnique({
      where: { id },
      include: {
        parent: { select: { id: true, uniqueName: true } },
        children: { select: { id: true, uniqueName: true, type: true } },
      },
    });

    if (!capability) {
      throw new NotFoundException(`Capability with ID "${id}" not found`);
    }

    // Branch-local capabilities must not be visible through the main API.
    if (capability.branchOriginId != null) {
      throw new NotFoundException(`Capability with ID "${id}" not found`);
    }

    return capability;
  }

  async create(dto: CreateCapabilityDto, options: CreateCapabilityOptions = {}) {
    this.validateActiveLifecycleMetadata({
      lifecycleStatus: dto.lifecycleStatus,
      description: dto.description,
      domain: dto.domain,
      stewardId: dto.stewardId,
      stewardDepartment: dto.stewardDepartment,
    });
    const guardrailState = this.resolveNameGuardrailState(dto.uniqueName, {
      override: dto.nameGuardrailOverride,
      overrideRationale: dto.nameGuardrailOverrideRationale,
    });
    const createData = {
      uniqueName: dto.uniqueName,
      aliases: dto.aliases ?? [],
      description: dto.description,
      domain: dto.domain,
      type: dto.type,
      parentId: dto.parentId,
      lifecycleStatus: dto.lifecycleStatus,
      effectiveFrom: dto.effectiveFrom ? new Date(dto.effectiveFrom) : undefined,
      effectiveTo: dto.effectiveTo ? new Date(dto.effectiveTo) : undefined,
      rationale: dto.rationale,
      sourceReferences: dto.sourceReferences ?? [],
      tags: dto.tags ?? [],
      stewardId: dto.stewardId,
      stewardDepartment: dto.stewardDepartment,
      nameGuardrailOverride: guardrailState.overrideApplied,
      nameGuardrailOverrideRationale: guardrailState.overrideRationale,
    } as Prisma.CapabilityCreateInput;

    try {
      const executeCreate = async (tx: Prisma.TransactionClient) => {
        await this.validateParent(dto.parentId, undefined, tx);
        await this.ensureUniqueNameAvailable(dto.uniqueName, undefined, tx);
        const createdCapability = await tx.capability.create({ data: createData });
        await this.capabilityVersionService.recordChange(tx, {
          capabilityId: createdCapability.id,
          changeType: 'CREATE',
          beforeSnapshot: null,
          afterSnapshot: createdCapability as unknown as Record<string, unknown>,
          changedBy: options.actorId ?? SYSTEM_ACTOR,
        });
        return createdCapability;
      };

      const createdCapability = options.tx
        ? await executeCreate(options.tx)
        : await this.prisma.$transaction(async (tx) => executeCreate(tx));

      return this.attachGuardrailWarnings(createdCapability, guardrailState.warnings);
    } catch (error) {
      this.rethrowUniqueNameConflict(error, dto.uniqueName);
      throw error;
    }
  }

  async update(id: string, dto: UpdateCapabilityDto) {
    const existingCapability = (await this.findOne(id)) as unknown as CapabilityWithGuardrailState;
    const nextUniqueName = this.resolveUpdatedField(dto.uniqueName, existingCapability.uniqueName);

    this.validateActiveLifecycleMetadata({
      lifecycleStatus:
        dto.lifecycleStatus !== undefined ? dto.lifecycleStatus : existingCapability.lifecycleStatus,
      description: this.resolveUpdatedField<string | null>(
        dto.description,
        existingCapability.description,
      ),
      domain: this.resolveUpdatedField<string | null>(dto.domain, existingCapability.domain),
      stewardId: this.resolveUpdatedField<string | null>(
        dto.stewardId,
        existingCapability.stewardId,
      ),
      stewardDepartment: this.resolveUpdatedField<string | null>(
        dto.stewardDepartment,
        existingCapability.stewardDepartment,
      ),
    });

    await this.validateParent(dto.parentId, id);

    if (dto.uniqueName) {
      await this.ensureUniqueNameAvailable(dto.uniqueName, id);
    }

    const data = { ...dto } as Prisma.CapabilityUpdateInput & Record<string, unknown>;
    const guardrailState = this.resolveNameGuardrailState(nextUniqueName, {
      override: dto.nameGuardrailOverride ?? existingCapability.nameGuardrailOverride,
      overrideRationale:
        dto.nameGuardrailOverrideRationale ?? existingCapability.nameGuardrailOverrideRationale,
    });

    if (dto.effectiveFrom) data.effectiveFrom = new Date(dto.effectiveFrom);
    if (dto.effectiveTo) data.effectiveTo = new Date(dto.effectiveTo);
    data.nameGuardrailOverride = guardrailState.overrideApplied;
    data.nameGuardrailOverrideRationale = guardrailState.overrideRationale;

    // Capture full before-snapshot (findOne result without relational includes)
    const beforeSnapshotRaw = await this.prisma.capability.findUnique({ where: { id } });
    const beforeSnapshot = beforeSnapshotRaw as unknown as Record<string, unknown>;

    // Determine change type: rename if uniqueName changed, else generic update
    const changeType =
      dto.uniqueName && dto.uniqueName !== existingCapability.uniqueName ? 'RENAME' : 'UPDATE';

    try {
      let updatedCapability!: Capability;

      await this.prisma.$transaction(async (tx) => {
        updatedCapability = await tx.capability.update({ where: { id }, data });
        await this.capabilityVersionService.recordChange(tx, {
          capabilityId: id,
          changeType,
          beforeSnapshot,
          afterSnapshot: updatedCapability as unknown as Record<string, unknown>,
          changedBy: SYSTEM_ACTOR,
        });
      });

      return this.attachGuardrailWarnings(updatedCapability, guardrailState.warnings);
    } catch (error) {
      this.rethrowUniqueNameConflict(error, dto.uniqueName);
      throw error;
    }
  }

  async getChildren(id: string) {
    await this.findOne(id);

    return this.prisma.capability.findMany({
      where: { parentId: id, branchOriginId: null },
      orderBy: { uniqueName: 'asc' },
    });
  }

  async getBreadcrumbs(id: string) {
    const breadcrumbs: Array<{ id: string; uniqueName: string }> = [];
    let currentId: string | null = id;
    const visitedCapabilityIds = new Set<string>();

    while (currentId) {
      if (visitedCapabilityIds.has(currentId)) {
        throw new BadRequestException(
          'Capability hierarchy contains a circular parent relationship',
        );
      }

      visitedCapabilityIds.add(currentId);

      const currentCapability: Pick<Capability, 'id' | 'uniqueName' | 'parentId'> & {
        branchOriginId: string | null;
      } | null = await this.prisma.capability.findUnique({
        where: { id: currentId },
        select: { id: true, uniqueName: true, parentId: true, branchOriginId: true },
      });

      if (!currentCapability) break;

      // If the *originally requested* capability is branch-local it must not be
      // visible through the main API – treat it as not found.
      if (breadcrumbs.length === 0 && currentCapability.branchOriginId != null) {
        break;
      }

      breadcrumbs.unshift({
        id: currentCapability.id,
        uniqueName: currentCapability.uniqueName,
      });
      currentId = currentCapability.parentId;
    }

    if (breadcrumbs.length === 0) {
      throw new NotFoundException(`Capability with ID "${id}" not found`);
    }

    return breadcrumbs;
  }

  async getSubtree(id: string): Promise<CapabilitySubtreeNode> {
    const capabilities = await this.collectSubtree(id);
    const childrenByParentId = new Map<string, Capability[]>();

    for (const capability of capabilities) {
      if (!capability.parentId) {
        continue;
      }

      const siblings = childrenByParentId.get(capability.parentId) ?? [];
      siblings.push(capability);
      childrenByParentId.set(capability.parentId, siblings);
    }

    const buildTree = (capability: Capability): CapabilitySubtreeNode => ({
      ...capability,
      children: (childrenByParentId.get(capability.id) ?? []).map(buildTree),
    });

    return buildTree(capabilities[0]);
  }

  async getLeaves(id: string) {
    const capabilities = await this.collectSubtree(id);
    const parentIds = new Set(
      capabilities.reduce<string[]>((ids, capability) => {
        if (capability.parentId) {
          ids.push(capability.parentId);
        }

        return ids;
      }, []),
    );

    return capabilities
      .filter((capability) => !parentIds.has(capability.id))
      .sort((left, right) => left.uniqueName.localeCompare(right.uniqueName));
  }

  async getStewardship(id: string): Promise<CapabilityStewardship> {
    const effectiveStewardship = await this.resolveEffectiveStewardship(id);

    if (!effectiveStewardship) {
      throw new NotFoundException(`Capability with ID "${id}" not found`);
    }

    if (this.hasDirectStewardshipAssignment(effectiveStewardship)) {
      return {
        capabilityId: id,
        stewardId: effectiveStewardship.stewardId,
        stewardDepartment: effectiveStewardship.stewardDepartment,
        source: effectiveStewardship.id === id ? 'DIRECT' : 'INHERITED',
        sourceCapabilityId: effectiveStewardship.id,
      };
    }

    return {
      capabilityId: id,
      stewardId: null,
      stewardDepartment: null,
      source: 'UNASSIGNED',
      sourceCapabilityId: null,
    };
  }

  async delete(id: string): Promise<void> {
    const capability = await this.findOne(id);

    if (capability.lifecycleStatus !== LifecycleStatus.DRAFT) {
      throw new BadRequestException('Only draft capabilities can be deleted');
    }

    if (capability.children.length > 0) {
      throw new BadRequestException('Capabilities with child capabilities cannot be deleted');
    }

    // Guard: prevent hard-delete if the capability appears in any published/rolled-back version.
    // Deleting version history for a published capability would corrupt historical queries.
    const publishedVersionCount = await this.prisma.capabilityVersion.count({
      where: {
        capabilityId: id,
        modelVersion: {
          state: { in: ['PUBLISHED', 'ROLLED_BACK'] },
        },
      },
    });
    if (publishedVersionCount > 0) {
      throw new ConflictException(
        `Cannot hard-delete capability "${id}": it appears in ${publishedVersionCount} published/rolled-back model version(s). Use RETIRE instead.`,
      );
    }

    await this.prisma.$transaction(async (tx) => {
      // Remove version history first (no cascade delete in schema)
      await tx.capabilityVersion.deleteMany({ where: { capabilityId: id } });
      await tx.capability.delete({ where: { id } });
    });
  }

  // TODO: Implement re-parent operation (move capability to new parent)
  // async reparent(id: string, newParentId: string) {}

  // TODO: Implement promote operation (move capability up one level)
  // async promote(id: string) {}

  // TODO: Implement demote operation (move capability under a sibling)
  // async demote(id: string, newParentId: string) {}

  // TODO: Implement merge operation (merge two capabilities)
  // async merge(sourceId: string, targetId: string) {}

  // TODO: Implement retire operation (retire a capability with downstream checks)
  // async retire(id: string, rationale: string) {}

  private async validateParent(
    parentId?: string,
    capabilityId?: string,
    db: CapabilityDatabaseClient = this.prisma,
  ) {
    if (!parentId) {
      return;
    }

    if (capabilityId && parentId === capabilityId) {
      throw new BadRequestException('A capability cannot be its own parent capability');
    }

    const parent = await db.capability.findUnique({
      where: { id: parentId },
      select: { id: true, branchOriginId: true },
    });

    if (!parent || parent.branchOriginId != null) {
      throw new NotFoundException(`Parent capability with ID "${parentId}" not found`);
    }

    if (!capabilityId) {
      return;
    }

    let currentAncestorId: string | null = parentId;
    const visitedCapabilityIds = new Set<string>();

    while (currentAncestorId) {
      if (currentAncestorId === capabilityId) {
        throw new BadRequestException(
          'A capability cannot be assigned to one of its descendant capabilities',
        );
      }

      if (visitedCapabilityIds.has(currentAncestorId)) {
        throw new BadRequestException(
          'Capability hierarchy contains a circular parent relationship',
        );
      }

      visitedCapabilityIds.add(currentAncestorId);

      const ancestorCapability: Pick<Capability, 'parentId'> | null =
        await db.capability.findUnique({
          where: { id: currentAncestorId },
          select: { parentId: true },
        });
      currentAncestorId = ancestorCapability?.parentId ?? null;
    }
  }

  private async ensureUniqueNameAvailable(
    uniqueName: string,
    currentCapabilityId?: string,
    db: CapabilityDatabaseClient = this.prisma,
  ) {
    const existingCapability = await db.capability.findUnique({
      where: { uniqueName },
      select: { id: true },
    });

    if (existingCapability && existingCapability.id !== currentCapabilityId) {
      throw new ConflictException(`Capability name "${uniqueName}" is already in use`);
    }
  }

  private async collectSubtree(id: string) {
    const rootCapability = await this.prisma.capability.findUnique({
      where: { id },
    });

    if (!rootCapability) {
      throw new NotFoundException(`Capability with ID "${id}" not found`);
    }

    // Branch-local capabilities must not be accessible through the main API.
    if (rootCapability.branchOriginId != null) {
      throw new NotFoundException(`Capability with ID "${id}" not found`);
    }

    const capabilities: Capability[] = [rootCapability];
    let currentParentIds = [rootCapability.id];
    const visitedCapabilityIds = new Set([rootCapability.id]);

    while (currentParentIds.length > 0) {
      const children = await this.prisma.capability.findMany({
        where: {
          parentId: {
            in: currentParentIds,
          },
          // Exclude branch-local capabilities from subtree traversal.
          branchOriginId: null,
        },
        orderBy: { uniqueName: 'asc' },
      });

      if (children.length === 0) {
        break;
      }

      const nextChildren: Capability[] = [];

      for (const child of children) {
        if (visitedCapabilityIds.has(child.id)) {
          throw new BadRequestException(
            'Capability hierarchy contains a circular parent relationship',
          );
        }

        visitedCapabilityIds.add(child.id);
        nextChildren.push(child);
      }

      capabilities.push(...nextChildren);
      currentParentIds = nextChildren.map((child) => child.id);
    }

    return capabilities;
  }

  private async resolveEffectiveStewardship(
    id: string,
  ): Promise<CapabilityStewardshipRecord | null> {
    let currentCapabilityId: string | null = id;
    let requestedCapability: CapabilityStewardshipRecord | null = null;
    const visitedCapabilityIds = new Set<string>();

    while (currentCapabilityId) {
      if (visitedCapabilityIds.has(currentCapabilityId)) {
        throw new InternalServerErrorException(
          'Capability hierarchy contains a circular parent relationship',
        );
      }

      visitedCapabilityIds.add(currentCapabilityId);

      const capability: (CapabilityStewardshipRecord & { branchOriginId: string | null }) | null =
        await this.prisma.capability.findUnique({
        where: { id: currentCapabilityId },
        select: {
          id: true,
          parentId: true,
          stewardId: true,
          stewardDepartment: true,
          branchOriginId: true,
        },
        });

      if (!capability) {
        return requestedCapability;
      }

      // The *requested* capability (first fetch) must not be branch-local.
      // Returning null causes getStewardship() to throw NotFoundException.
      if (requestedCapability === null && capability.branchOriginId != null) {
        return null;
      }

      requestedCapability ??= capability;

      if (this.hasDirectStewardshipAssignment(capability)) {
        return capability;
      }

      currentCapabilityId = capability.parentId;
    }

    return requestedCapability;
  }

  private rethrowUniqueNameConflict(error: unknown, uniqueName?: string): void {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      throw new ConflictException(
        `Capability name "${uniqueName ?? 'provided'}" is already in use`,
      );
    }
  }

  private normalizePositiveInteger(value: number | undefined, fallback: number): number {
    if (typeof value !== 'number' || Number.isNaN(value) || value < 1) {
      return fallback;
    }

    return Math.floor(value);
  }

  private validateActiveLifecycleMetadata(
    snapshot: ActiveLifecycleMetadataSnapshot,
  ): void {
    if (snapshot.lifecycleStatus !== LifecycleStatus.ACTIVE) {
      return;
    }

    const missingFields = ACTIVE_LIFECYCLE_REQUIRED_FIELDS.filter(
      (field) => !this.hasMeaningfulValue(snapshot[field]),
    );

    if (missingFields.length > 0) {
      throw new ActiveLifecycleMetadataIncompleteException(missingFields);
    }
  }

  private resolveUpdatedField<T>(incomingValue: T | undefined, persistedValue: T): T {
    return incomingValue === undefined ? persistedValue : incomingValue;
  }

  private resolveNameGuardrailState(
    uniqueName: string,
    options: {
      override?: boolean;
      overrideRationale?: string | null;
    },
  ): {
    overrideApplied: boolean;
    overrideRationale: string | null;
    warnings: CapabilityNameGuardrailWarning[];
  } {
    const requestedOverride = options.override === true;
    const overrideRationale = this.normalizeOptionalString(options.overrideRationale);
    const evaluation = this.nameGuardrailService.evaluateName(
      uniqueName,
      requestedOverride,
      overrideRationale,
    );

    if (!evaluation.flagged) {
      return {
        overrideApplied: false,
        overrideRationale: null,
        warnings: [],
      };
    }

    if (requestedOverride && !overrideRationale) {
      throw new BadRequestException(
        'Capability name guardrail overrides require a rationale when the name matches the configured blocklist',
      );
    }

    return {
      overrideApplied: requestedOverride,
      overrideRationale: requestedOverride ? overrideRationale : null,
      warnings: evaluation.warning ? [evaluation.warning] : [],
    };
  }

  private attachGuardrailWarnings<T extends Record<string, unknown>>(
    capability: T,
    warnings: CapabilityNameGuardrailWarning[],
  ): T & { guardrailWarnings?: CapabilityNameGuardrailWarning[] } {
    if (warnings.length === 0) {
      return capability;
    }

    return {
      ...capability,
      guardrailWarnings: warnings,
    };
  }

  private hasMeaningfulValue(value: string | null | undefined): value is string {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private normalizeOptionalString(value: string | null | undefined): string | null {
    if (!this.hasMeaningfulValue(value)) {
      return null;
    }

    return value.trim();
  }

  private hasDirectStewardshipAssignment(
    capability: CapabilityStewardshipRecord,
  ): capability is CapabilityStewardshipRecord & {
    stewardId: string;
    stewardDepartment: string;
  } {
    return (
      this.hasMeaningfulValue(capability.stewardId) &&
      this.hasMeaningfulValue(capability.stewardDepartment)
    );
  }
}
