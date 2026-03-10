import { Injectable } from '@nestjs/common';
import {
  AuditAction,
  AuditEntityType,
  CapabilityType,
  LifecycleStatus,
  MappingState,
  Prisma,
} from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import type { GetGapAnalysisDto } from './dto/get-gap-analysis.dto';
import type { GetRecentActivityDto } from './dto/get-recent-activity.dto';
import type {
  AnalyticsGapCapability,
  AnalyticsHeatmapCell,
  CoverageMetric,
  GapAnalysisResult,
  MappingCoverageDomainBreakdown,
  MappingCoverageReport,
  MappingTypeCount,
  ModelHealthDomainBreakdown,
  ModelHealthSummary,
  RecentActivityItem,
  RecentActivityReport,
  StewardshipCoverageDomainBreakdown,
  StewardshipCoverageReport,
  StewardshipLeader,
} from './analytics.types';

const LIFECYCLE_STATUSES = [
  LifecycleStatus.DRAFT,
  LifecycleStatus.ACTIVE,
  LifecycleStatus.DEPRECATED,
  LifecycleStatus.RETIRED,
] as const;

const RECENT_ACTIVITY_ENTITY_TYPES = [
  AuditEntityType.CAPABILITY,
  AuditEntityType.MAPPING,
  AuditEntityType.CHANGE_REQUEST,
  AuditEntityType.MODEL_VERSION,
] as const;

const DEFAULT_GAP_ANALYSIS_LIMIT = 50;
const MAX_GAP_ANALYSIS_LIMIT = 200;
const DEFAULT_RECENT_ACTIVITY_LIMIT = 20;
const MAX_RECENT_ACTIVITY_LIMIT = 100;
const TOP_STEWARDS_LIMIT = 10;

type MainCapabilityRecord = {
  id: string;
  uniqueName: string;
  domain: string | null;
  type: CapabilityType;
  lifecycleStatus: LifecycleStatus;
  stewardId: string | null;
  stewardDepartment: string | null;
  createdAt: Date;
  updatedAt: Date;
};

type MappingRecord = {
  id: string;
  mappingType: string;
  systemId: string;
  capabilityId: string;
  state: MappingState;
  createdAt: Date;
  updatedAt: Date;
};

type AuditEntryRecord = {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorId: string;
  before: Prisma.JsonValue | null;
  after: Prisma.JsonValue | null;
  metadata: Prisma.JsonValue | null;
  timestamp: Date;
};

interface AnalyticsDataset {
  capabilities: MainCapabilityRecord[];
  mappings: MappingRecord[];
  mappedCapabilityIds: Set<string>;
  activeMappedCapabilityIds: Set<string>;
  activeMappingsByCapabilityId: Map<string, MappingRecord[]>;
}

interface ModelHealthDomainAccumulator {
  domain: string | null;
  capabilityCount: number;
  leafCapabilityCount: number;
  mappedCapabilityCount: number;
  mappedLeafCapabilityCount: number;
  stewardshipCoverageCount: number;
  lifecycleStatusCounts: Record<LifecycleStatus, number>;
  capabilityTypeCounts: Record<CapabilityType, number>;
}

interface StewardshipDomainAccumulator {
  domain: string | null;
  totalCapabilities: number;
  stewardAssignedCount: number;
  stewardDepartmentAssignedCount: number;
  fullyCoveredCount: number;
}

interface MappingDomainAccumulator {
  domain: string | null;
  totalLeafCapabilities: number;
  mappedLeafCapabilities: number;
  activeMappedLeafCapabilities: number;
}

interface StewardAccumulator {
  stewardId: string;
  capabilityCount: number;
  domains: Set<string | null>;
}

@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Build a model-health snapshot for the main capability model.
   *
   * @returns Aggregated totals and breakdowns by lifecycle status, type, and domain.
   */
  async getModelHealthSummary(): Promise<ModelHealthSummary> {
    const dataset = await this.loadAnalyticsDataset();
    const lifecycleStatusCounts = this.createLifecycleStatusCounts();
    const capabilityTypeCounts = this.createCapabilityTypeCounts();
    const domainBreakdownMap = new Map<string, ModelHealthDomainAccumulator>();

    let totalLeafCapabilities = 0;
    let stewardshipCoverageCount = 0;
    let mappedLeafCapabilities = 0;

    for (const capability of dataset.capabilities) {
      lifecycleStatusCounts[capability.lifecycleStatus] += 1;
      capabilityTypeCounts[capability.type] += 1;

      const domainAccumulator = this.getOrCreateModelHealthDomainAccumulator(
        domainBreakdownMap,
        capability.domain,
      );
      domainAccumulator.capabilityCount += 1;
      domainAccumulator.lifecycleStatusCounts[capability.lifecycleStatus] += 1;
      domainAccumulator.capabilityTypeCounts[capability.type] += 1;

      if (capability.type === CapabilityType.LEAF) {
        totalLeafCapabilities += 1;
        domainAccumulator.leafCapabilityCount += 1;

        if (dataset.mappedCapabilityIds.has(capability.id)) {
          mappedLeafCapabilities += 1;
          domainAccumulator.mappedLeafCapabilityCount += 1;
        }
      }

      if (dataset.mappedCapabilityIds.has(capability.id)) {
        domainAccumulator.mappedCapabilityCount += 1;
      }

      if (this.hasCompleteStewardship(capability)) {
        stewardshipCoverageCount += 1;
        domainAccumulator.stewardshipCoverageCount += 1;
      }
    }

    return {
      totalCapabilities: dataset.capabilities.length,
      totalLeafCapabilities,
      totalMappings: dataset.mappings.length,
      mappedCapabilities: dataset.mappedCapabilityIds.size,
      mappedLeafCapabilities,
      lifecycleStatusCounts,
      capabilityTypeCounts,
      domainBreakdown: this.sortByDomain(
        Array.from(domainBreakdownMap.values()).map(
          (domainBreakdown): ModelHealthDomainBreakdown => ({
            ...domainBreakdown,
            lifecycleStatusCounts: { ...domainBreakdown.lifecycleStatusCounts },
            capabilityTypeCounts: { ...domainBreakdown.capabilityTypeCounts },
          }),
        ),
      ),
      stewardshipCoverage: this.createCoverageMetric(
        stewardshipCoverageCount,
        dataset.capabilities.length,
      ),
      mappingCoverage: this.createCoverageMetric(mappedLeafCapabilities, totalLeafCapabilities),
    };
  }

  /**
   * Summarise stewardship completeness across the main capability model.
   *
   * @returns Overall and per-domain stewardship coverage plus the heaviest steward loads.
   */
  async getStewardshipCoverage(): Promise<StewardshipCoverageReport> {
    const dataset = await this.loadAnalyticsDataset();
    const domainBreakdownMap = new Map<string, StewardshipDomainAccumulator>();
    const stewardLeaderboard = new Map<string, StewardAccumulator>();

    let stewardAssignedCount = 0;
    let stewardDepartmentAssignedCount = 0;
    let fullyCoveredCount = 0;

    for (const capability of dataset.capabilities) {
      const domainAccumulator = this.getOrCreateStewardshipDomainAccumulator(
        domainBreakdownMap,
        capability.domain,
      );
      domainAccumulator.totalCapabilities += 1;

      if (this.hasSteward(capability)) {
        stewardAssignedCount += 1;
        domainAccumulator.stewardAssignedCount += 1;

        const stewardId = capability.stewardId as string;
        const current = stewardLeaderboard.get(stewardId) ?? {
          stewardId,
          capabilityCount: 0,
          domains: new Set<string | null>(),
        };
        current.capabilityCount += 1;
        current.domains.add(this.normalizeDomain(capability.domain));
        stewardLeaderboard.set(stewardId, current);
      }

      if (this.hasStewardDepartment(capability)) {
        stewardDepartmentAssignedCount += 1;
        domainAccumulator.stewardDepartmentAssignedCount += 1;
      }

      if (this.hasCompleteStewardship(capability)) {
        fullyCoveredCount += 1;
        domainAccumulator.fullyCoveredCount += 1;
      }
    }

    const topStewards = Array.from(stewardLeaderboard.values())
      .sort(
        (left, right) =>
          right.capabilityCount - left.capabilityCount ||
          left.stewardId.localeCompare(right.stewardId),
      )
      .slice(0, TOP_STEWARDS_LIMIT)
      .map(
        (leader): StewardshipLeader => ({
          stewardId: leader.stewardId,
          capabilityCount: leader.capabilityCount,
          domains: Array.from(leader.domains).sort((left, right) =>
            this.compareNullableStrings(left, right),
          ),
        }),
      );

    return {
      totalCapabilities: dataset.capabilities.length,
      stewardAssignedCount,
      stewardDepartmentAssignedCount,
      fullyCoveredCount,
      coverage: this.createCoverageMetric(fullyCoveredCount, dataset.capabilities.length),
      byDomain: this.sortByDomain(
        Array.from(domainBreakdownMap.values()).map(
          (domainBreakdown): StewardshipCoverageDomainBreakdown => ({
            domain: domainBreakdown.domain,
            totalCapabilities: domainBreakdown.totalCapabilities,
            stewardAssignedCount: domainBreakdown.stewardAssignedCount,
            stewardDepartmentAssignedCount: domainBreakdown.stewardDepartmentAssignedCount,
            fullyCoveredCount: domainBreakdown.fullyCoveredCount,
            coveragePercentage: this.toPercentage(
              domainBreakdown.fullyCoveredCount,
              domainBreakdown.totalCapabilities,
            ),
          }),
        ),
      ),
      topStewards,
    };
  }

  /**
   * Measure leaf-capability mapping coverage for the main capability model.
   *
   * @returns Overall coverage, active coverage, domain breakdowns, and mapping distributions.
   */
  async getMappingCoverage(): Promise<MappingCoverageReport> {
    const dataset = await this.loadAnalyticsDataset();
    const domainBreakdownMap = new Map<string, MappingDomainAccumulator>();
    const mappingStateCounts = this.createMappingStateCounts();
    const mappingTypeCountsMap = new Map<string, number>();
    const uniqueSystems = new Set<string>();

    let totalLeafCapabilities = 0;
    let mappedLeafCapabilities = 0;
    let activeMappedLeafCapabilities = 0;

    for (const mapping of dataset.mappings) {
      mappingStateCounts[mapping.state] += 1;
      mappingTypeCountsMap.set(
        mapping.mappingType,
        (mappingTypeCountsMap.get(mapping.mappingType) ?? 0) + 1,
      );
      uniqueSystems.add(mapping.systemId);
    }

    for (const capability of dataset.capabilities) {
      if (capability.type !== CapabilityType.LEAF) {
        continue;
      }

      totalLeafCapabilities += 1;
      const domainAccumulator = this.getOrCreateMappingDomainAccumulator(
        domainBreakdownMap,
        capability.domain,
      );
      domainAccumulator.totalLeafCapabilities += 1;

      if (dataset.mappedCapabilityIds.has(capability.id)) {
        mappedLeafCapabilities += 1;
        domainAccumulator.mappedLeafCapabilities += 1;
      }

      if (dataset.activeMappedCapabilityIds.has(capability.id)) {
        activeMappedLeafCapabilities += 1;
        domainAccumulator.activeMappedLeafCapabilities += 1;
      }
    }

    const mappingTypeCounts = Array.from(mappingTypeCountsMap.entries())
      .map(
        ([mappingType, count]): MappingTypeCount => ({
          mappingType,
          count,
        }),
      )
      .sort(
        (left, right) =>
          right.count - left.count || left.mappingType.localeCompare(right.mappingType),
      );

    return {
      totalMappings: dataset.mappings.length,
      systemsCount: uniqueSystems.size,
      mappedCapabilities: dataset.mappedCapabilityIds.size,
      mappedLeafCapabilities,
      activeMappedLeafCapabilities,
      coverage: this.createCoverageMetric(mappedLeafCapabilities, totalLeafCapabilities),
      activeCoverage: this.createCoverageMetric(
        activeMappedLeafCapabilities,
        totalLeafCapabilities,
      ),
      mappingStateCounts,
      mappingTypeCounts,
      byDomain: this.sortByDomain(
        Array.from(domainBreakdownMap.values()).map(
          (domainBreakdown): MappingCoverageDomainBreakdown => ({
            domain: domainBreakdown.domain,
            totalLeafCapabilities: domainBreakdown.totalLeafCapabilities,
            mappedLeafCapabilities: domainBreakdown.mappedLeafCapabilities,
            activeMappedLeafCapabilities: domainBreakdown.activeMappedLeafCapabilities,
            coveragePercentage: this.toPercentage(
              domainBreakdown.mappedLeafCapabilities,
              domainBreakdown.totalLeafCapabilities,
            ),
          }),
        ),
      ),
    };
  }

  /**
   * Build heatmap cells keyed by domain and lifecycle status.
   *
   * @returns Heatmap cells for every observed domain across all lifecycle statuses.
   */
  async getHeatmap(): Promise<AnalyticsHeatmapCell[]> {
    const dataset = await this.loadAnalyticsDataset();
    if (dataset.capabilities.length === 0) {
      return [];
    }

    const domains = Array.from(
      new Set(dataset.capabilities.map((capability) => this.toDomainKey(capability.domain))),
    )
      .map((domainKey) => this.fromDomainKey(domainKey))
      .sort((left, right) => this.compareNullableStrings(left, right));

    const cellMap = new Map<string, AnalyticsHeatmapCell>();

    for (const domain of domains) {
      for (const lifecycleStatus of LIFECYCLE_STATUSES) {
        const key = this.toHeatmapKey(domain, lifecycleStatus);
        cellMap.set(key, {
          domain,
          lifecycleStatus,
          capabilityCount: 0,
          mappedCapabilityCount: 0,
          mappedLeafCapabilityCount: 0,
          stewardshipCoverageCount: 0,
        });
      }
    }

    for (const capability of dataset.capabilities) {
      const key = this.toHeatmapKey(capability.domain, capability.lifecycleStatus);
      const cell = cellMap.get(key);

      if (!cell) {
        continue;
      }

      cell.capabilityCount += 1;

      if (dataset.mappedCapabilityIds.has(capability.id)) {
        cell.mappedCapabilityCount += 1;
      }

      if (capability.type === CapabilityType.LEAF && dataset.mappedCapabilityIds.has(capability.id)) {
        cell.mappedLeafCapabilityCount += 1;
      }

      if (this.hasCompleteStewardship(capability)) {
        cell.stewardshipCoverageCount += 1;
      }
    }

    return domains.flatMap((domain) =>
      LIFECYCLE_STATUSES.map((lifecycleStatus) => {
        const key = this.toHeatmapKey(domain, lifecycleStatus);
        return cellMap.get(key) as AnalyticsHeatmapCell;
      }),
    );
  }

  /**
   * Run the Phase 12 gap-analysis queries.
   *
   * @param query Optional domain and per-list limit filters.
   * @returns Unmapped active leaves and deprecated capabilities with active mappings.
   */
  async getGapAnalysis(query: GetGapAnalysisDto): Promise<GapAnalysisResult> {
    const dataset = await this.loadAnalyticsDataset();
    const normalizedDomainFilter = this.normalizeDomainFilter(query.domain);
    const limit = this.normalizeLimit(
      query.limit,
      DEFAULT_GAP_ANALYSIS_LIMIT,
      MAX_GAP_ANALYSIS_LIMIT,
    );

    const scopedCapabilities = dataset.capabilities.filter((capability) =>
      normalizedDomainFilter === undefined
        ? true
        : this.normalizeDomain(capability.domain) === normalizedDomainFilter,
    );

    const unmappedActiveLeafCapabilities = scopedCapabilities
      .filter(
        (capability) =>
          capability.type === CapabilityType.LEAF &&
          capability.lifecycleStatus === LifecycleStatus.ACTIVE &&
          !dataset.mappedCapabilityIds.has(capability.id),
      )
      .sort((left, right) => this.compareCapabilities(left, right));

    const deprecatedCapabilitiesWithActiveMappings = scopedCapabilities
      .filter(
        (capability) =>
          capability.lifecycleStatus === LifecycleStatus.DEPRECATED &&
          dataset.activeMappedCapabilityIds.has(capability.id),
      )
      .sort((left, right) => this.compareCapabilities(left, right));

    return {
      summary: {
        unmappedActiveLeafCapabilityCount: unmappedActiveLeafCapabilities.length,
        deprecatedCapabilitiesWithActiveMappingsCount:
          deprecatedCapabilitiesWithActiveMappings.length,
      },
      appliedFilters: {
        domain: normalizedDomainFilter ?? null,
        limit,
      },
      unmappedActiveLeafCapabilities: unmappedActiveLeafCapabilities
        .slice(0, limit)
        .map((capability) => this.toGapCapability(capability)),
      deprecatedCapabilitiesWithActiveMappings: deprecatedCapabilitiesWithActiveMappings
        .slice(0, limit)
        .map((capability) => {
          const activeMappings = dataset.activeMappingsByCapabilityId.get(capability.id) ?? [];

          return {
            ...this.toGapCapability(capability),
            activeMappingCount: activeMappings.length,
            systems: Array.from(new Set(activeMappings.map((mapping) => mapping.systemId))).sort(
              (left, right) => left.localeCompare(right),
            ),
          };
        }),
    };
  }

  /**
   * List recent model activity from the generic audit trail.
   *
   * @param query Optional limit for how many entries to return.
   * @returns Newest-first audit-derived activity summaries for model-related entities.
   */
  async getRecentActivity(query: GetRecentActivityDto): Promise<RecentActivityReport> {
    const limit = this.normalizeLimit(
      query.limit,
      DEFAULT_RECENT_ACTIVITY_LIMIT,
      MAX_RECENT_ACTIVITY_LIMIT,
    );

    const items = await this.prisma.auditEntry.findMany({
      where: {
        entityType: {
          in: [...RECENT_ACTIVITY_ENTITY_TYPES],
        },
      },
      orderBy: { timestamp: 'desc' },
      take: limit,
    });

    return {
      items: items.map((item) => this.toRecentActivityItem(item)),
      totalReturned: items.length,
    };
  }

  private async loadAnalyticsDataset(): Promise<AnalyticsDataset> {
    const [capabilities, mappings] = await this.prisma.$transaction([
      this.prisma.capability.findMany({
        where: { branchOriginId: null },
        select: {
          id: true,
          uniqueName: true,
          domain: true,
          type: true,
          lifecycleStatus: true,
          stewardId: true,
          stewardDepartment: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
      this.prisma.mapping.findMany({
        select: {
          id: true,
          mappingType: true,
          systemId: true,
          capabilityId: true,
          state: true,
          createdAt: true,
          updatedAt: true,
        },
      }),
    ]);

    const capabilityIds = new Set(capabilities.map((capability) => capability.id));
    const filteredMappings = mappings.filter((mapping) => capabilityIds.has(mapping.capabilityId));
    const activeMappingsByCapabilityId = new Map<string, MappingRecord[]>();
    const mappedCapabilityIds = new Set<string>();
    const activeMappedCapabilityIds = new Set<string>();

    for (const mapping of filteredMappings) {
      mappedCapabilityIds.add(mapping.capabilityId);

      if (mapping.state === MappingState.ACTIVE) {
        activeMappedCapabilityIds.add(mapping.capabilityId);
        const activeMappings = activeMappingsByCapabilityId.get(mapping.capabilityId) ?? [];
        activeMappings.push(mapping);
        activeMappingsByCapabilityId.set(mapping.capabilityId, activeMappings);
      }
    }

    return {
      capabilities,
      mappings: filteredMappings,
      mappedCapabilityIds,
      activeMappedCapabilityIds,
      activeMappingsByCapabilityId,
    };
  }

  private getOrCreateModelHealthDomainAccumulator(
    domainBreakdownMap: Map<string, ModelHealthDomainAccumulator>,
    domain: string | null,
  ): ModelHealthDomainAccumulator {
    const key = this.toDomainKey(domain);
    const existing = domainBreakdownMap.get(key);

    if (existing) {
      return existing;
    }

    const created: ModelHealthDomainAccumulator = {
      domain: this.normalizeDomain(domain),
      capabilityCount: 0,
      leafCapabilityCount: 0,
      mappedCapabilityCount: 0,
      mappedLeafCapabilityCount: 0,
      stewardshipCoverageCount: 0,
      lifecycleStatusCounts: this.createLifecycleStatusCounts(),
      capabilityTypeCounts: this.createCapabilityTypeCounts(),
    };
    domainBreakdownMap.set(key, created);

    return created;
  }

  private getOrCreateStewardshipDomainAccumulator(
    domainBreakdownMap: Map<string, StewardshipDomainAccumulator>,
    domain: string | null,
  ): StewardshipDomainAccumulator {
    const key = this.toDomainKey(domain);
    const existing = domainBreakdownMap.get(key);

    if (existing) {
      return existing;
    }

    const created: StewardshipDomainAccumulator = {
      domain: this.normalizeDomain(domain),
      totalCapabilities: 0,
      stewardAssignedCount: 0,
      stewardDepartmentAssignedCount: 0,
      fullyCoveredCount: 0,
    };
    domainBreakdownMap.set(key, created);

    return created;
  }

  private getOrCreateMappingDomainAccumulator(
    domainBreakdownMap: Map<string, MappingDomainAccumulator>,
    domain: string | null,
  ): MappingDomainAccumulator {
    const key = this.toDomainKey(domain);
    const existing = domainBreakdownMap.get(key);

    if (existing) {
      return existing;
    }

    const created: MappingDomainAccumulator = {
      domain: this.normalizeDomain(domain),
      totalLeafCapabilities: 0,
      mappedLeafCapabilities: 0,
      activeMappedLeafCapabilities: 0,
    };
    domainBreakdownMap.set(key, created);

    return created;
  }

  private toGapCapability(capability: MainCapabilityRecord): AnalyticsGapCapability {
    return {
      id: capability.id,
      uniqueName: capability.uniqueName,
      domain: this.normalizeDomain(capability.domain),
      lifecycleStatus: capability.lifecycleStatus,
      stewardId: capability.stewardId,
      stewardDepartment: capability.stewardDepartment,
      updatedAt: capability.updatedAt.toISOString(),
    };
  }

  private toRecentActivityItem(item: AuditEntryRecord): RecentActivityItem {
    return {
      id: item.id,
      entityType: item.entityType,
      entityId: item.entityId,
      action: item.action,
      actorId: item.actorId,
      occurredAt: item.timestamp.toISOString(),
      summary: this.summarizeAuditEntry(item),
    };
  }

  private summarizeAuditEntry(item: AuditEntryRecord): string {
    const actor = item.actorId;
    const action = this.toPastTense(item.action);
    const after = this.toJsonRecord(item.after);
    const before = this.toJsonRecord(item.before);
    const metadata = this.toJsonRecord(item.metadata);

    switch (item.entityType) {
      case AuditEntityType.CAPABILITY:
        return `${actor} ${action} ${this.describeCapability(after, before, item.entityId)}`;
      case AuditEntityType.MAPPING:
        return `${actor} ${action} ${this.describeMapping(after, before, metadata, item.entityId)}`;
      case AuditEntityType.CHANGE_REQUEST:
        return `${actor} ${action} ${this.describeChangeRequest(
          after,
          before,
          item.entityId,
        )}`;
      case AuditEntityType.MODEL_VERSION:
        return `${actor} ${action} ${this.describeModelVersion(after, before, item.entityId)}`;
      default:
        return `${actor} ${action} ${item.entityType.toLowerCase()} ${item.entityId}`;
    }
  }

  private describeCapability(
    after: Record<string, unknown> | null,
    before: Record<string, unknown> | null,
    entityId: string,
  ): string {
    const capabilityName =
      this.readStringField(after, 'uniqueName') ??
      this.readStringField(after, 'name') ??
      this.readStringField(before, 'uniqueName') ??
      this.readStringField(before, 'name');

    return capabilityName
      ? `capability "${capabilityName}"`
      : `capability ${entityId}`;
  }

  private describeMapping(
    after: Record<string, unknown> | null,
    before: Record<string, unknown> | null,
    metadata: Record<string, unknown> | null,
    entityId: string,
  ): string {
    const systemId =
      this.readStringField(after, 'systemId') ??
      this.readStringField(before, 'systemId') ??
      this.readStringField(metadata, 'systemId');
    const capabilityId =
      this.readStringField(after, 'capabilityId') ??
      this.readStringField(before, 'capabilityId') ??
      this.readStringField(metadata, 'capabilityId');

    if (systemId && capabilityId) {
      return `mapping ${systemId} → ${capabilityId}`;
    }

    return `mapping ${entityId}`;
  }

  private describeChangeRequest(
    after: Record<string, unknown> | null,
    before: Record<string, unknown> | null,
    entityId: string,
  ): string {
    const changeRequestType =
      this.readStringField(after, 'type') ?? this.readStringField(before, 'type');

    return changeRequestType
      ? `change request ${entityId} (${changeRequestType})`
      : `change request ${entityId}`;
  }

  private describeModelVersion(
    after: Record<string, unknown> | null,
    before: Record<string, unknown> | null,
    entityId: string,
  ): string {
    const versionLabel =
      this.readStringField(after, 'versionLabel') ??
      this.readStringField(before, 'versionLabel');

    return versionLabel
      ? `model version "${versionLabel}"`
      : `model version ${entityId}`;
  }

  private toJsonRecord(value: Prisma.JsonValue | null): Record<string, unknown> | null {
    if (value === null || Array.isArray(value) || typeof value !== 'object') {
      return null;
    }

    return value as Record<string, unknown>;
  }

  private readStringField(
    record: Record<string, unknown> | null,
    key: string,
  ): string | null {
    const value = record?.[key];
    return typeof value === 'string' && value.trim().length > 0 ? value : null;
  }

  private compareCapabilities(
    left: Pick<MainCapabilityRecord, 'domain' | 'uniqueName' | 'id'>,
    right: Pick<MainCapabilityRecord, 'domain' | 'uniqueName' | 'id'>,
  ): number {
    return (
      this.compareNullableStrings(this.normalizeDomain(left.domain), this.normalizeDomain(right.domain)) ||
      left.uniqueName.localeCompare(right.uniqueName) ||
      left.id.localeCompare(right.id)
    );
  }

  private createCoverageMetric(covered: number, total: number): CoverageMetric {
    return {
      covered,
      total,
      percentage: this.toPercentage(covered, total),
    };
  }

  private toPercentage(covered: number, total: number): number {
    if (total === 0) {
      return 0;
    }

    return Number(((covered / total) * 100).toFixed(1));
  }

  private createLifecycleStatusCounts(): Record<LifecycleStatus, number> {
    return {
      [LifecycleStatus.DRAFT]: 0,
      [LifecycleStatus.ACTIVE]: 0,
      [LifecycleStatus.DEPRECATED]: 0,
      [LifecycleStatus.RETIRED]: 0,
    };
  }

  private createCapabilityTypeCounts(): Record<CapabilityType, number> {
    return {
      [CapabilityType.ABSTRACT]: 0,
      [CapabilityType.LEAF]: 0,
    };
  }

  private createMappingStateCounts(): Record<MappingState, number> {
    return {
      [MappingState.ACTIVE]: 0,
      [MappingState.INACTIVE]: 0,
      [MappingState.PENDING]: 0,
    };
  }

  private sortByDomain<T extends { domain: string | null }>(items: T[]): T[] {
    return [...items].sort((left, right) =>
      this.compareNullableStrings(left.domain, right.domain),
    );
  }

  private compareNullableStrings(
    left: string | null,
    right: string | null,
  ): number {
    if (left === right) {
      return 0;
    }

    if (left === null) {
      return 1;
    }

    if (right === null) {
      return -1;
    }

    return left.localeCompare(right);
  }

  private normalizeDomain(domain: string | null | undefined): string | null {
    const trimmed = domain?.trim();
    return trimmed ? trimmed : null;
  }

  private normalizeDomainFilter(domain: string | undefined): string | undefined {
    const normalized = this.normalizeDomain(domain);
    return normalized ?? undefined;
  }

  private hasSteward(capability: Pick<MainCapabilityRecord, 'stewardId'>): boolean {
    return this.hasText(capability.stewardId);
  }

  private hasStewardDepartment(
    capability: Pick<MainCapabilityRecord, 'stewardDepartment'>,
  ): boolean {
    return this.hasText(capability.stewardDepartment);
  }

  private hasCompleteStewardship(
    capability: Pick<MainCapabilityRecord, 'stewardId' | 'stewardDepartment'>,
  ): boolean {
    return this.hasSteward(capability) && this.hasStewardDepartment(capability);
  }

  private hasText(value: string | null | undefined): boolean {
    return typeof value === 'string' && value.trim().length > 0;
  }

  private normalizeLimit(value: number | undefined, fallback: number, max: number): number {
    if (!Number.isFinite(value)) {
      return fallback;
    }

    const normalized = Math.trunc(value as number);
    return Math.min(max, Math.max(1, normalized));
  }

  private toDomainKey(domain: string | null | undefined): string {
    return this.normalizeDomain(domain) ?? '__NULL_DOMAIN__';
  }

  private fromDomainKey(domainKey: string): string | null {
    return domainKey === '__NULL_DOMAIN__' ? null : domainKey;
  }

  private toHeatmapKey(
    domain: string | null | undefined,
    lifecycleStatus: LifecycleStatus,
  ): string {
    return `${this.toDomainKey(domain)}::${lifecycleStatus}`;
  }

  private toPastTense(action: AuditAction): string {
    switch (action) {
      case AuditAction.CREATE:
        return 'created';
      case AuditAction.UPDATE:
        return 'updated';
      case AuditAction.DELETE:
        return 'deleted';
      case AuditAction.PUBLISH:
        return 'published';
      case AuditAction.ROLLBACK:
        return 'rolled back';
      case AuditAction.SUBMIT:
        return 'submitted';
      case AuditAction.APPROVE:
        return 'approved';
      case AuditAction.REJECT:
        return 'rejected';
      case AuditAction.CANCEL:
        return 'cancelled';
      case AuditAction.LOCK:
        return 'locked';
      case AuditAction.UNLOCK:
        return 'unlocked';
      case AuditAction.LOGIN:
        return 'logged in to';
      case AuditAction.LOGOUT:
        return 'logged out of';
      case AuditAction.PERMISSION_CHANGE:
        return 'changed permissions on';
    }
  }
}
