/**
 * Local analytics types for the API layer.
 * Keep these aligned with `packages/shared/src/types/analytics.ts`.
 */
import type {
  AuditAction,
  AuditEntityType,
  CapabilityType,
  LifecycleStatus,
  MappingState,
} from '@prisma/client';

export interface AnalyticsResponse<T> {
  data: T;
  meta: {
    generatedAt: string;
  };
}

export interface CoverageMetric {
  covered: number;
  total: number;
  percentage: number;
}

export interface ModelHealthDomainBreakdown {
  domain: string | null;
  capabilityCount: number;
  leafCapabilityCount: number;
  mappedCapabilityCount: number;
  mappedLeafCapabilityCount: number;
  stewardshipCoverageCount: number;
  lifecycleStatusCounts: Record<LifecycleStatus, number>;
  capabilityTypeCounts: Record<CapabilityType, number>;
}

export interface ModelHealthSummary {
  totalCapabilities: number;
  totalLeafCapabilities: number;
  totalMappings: number;
  mappedCapabilities: number;
  mappedLeafCapabilities: number;
  lifecycleStatusCounts: Record<LifecycleStatus, number>;
  capabilityTypeCounts: Record<CapabilityType, number>;
  domainBreakdown: ModelHealthDomainBreakdown[];
  stewardshipCoverage: CoverageMetric;
  mappingCoverage: CoverageMetric;
}

export interface StewardshipCoverageDomainBreakdown {
  domain: string | null;
  totalCapabilities: number;
  stewardAssignedCount: number;
  stewardDepartmentAssignedCount: number;
  fullyCoveredCount: number;
  coveragePercentage: number;
}

export interface StewardshipLeader {
  stewardId: string;
  capabilityCount: number;
  domains: Array<string | null>;
}

export interface StewardshipCoverageReport {
  totalCapabilities: number;
  stewardAssignedCount: number;
  stewardDepartmentAssignedCount: number;
  fullyCoveredCount: number;
  coverage: CoverageMetric;
  byDomain: StewardshipCoverageDomainBreakdown[];
  topStewards: StewardshipLeader[];
}

export interface MappingCoverageDomainBreakdown {
  domain: string | null;
  totalLeafCapabilities: number;
  mappedLeafCapabilities: number;
  activeMappedLeafCapabilities: number;
  coveragePercentage: number;
}

export interface MappingTypeCount {
  mappingType: string;
  count: number;
}

export interface MappingCoverageReport {
  totalMappings: number;
  systemsCount: number;
  mappedCapabilities: number;
  mappedLeafCapabilities: number;
  activeMappedLeafCapabilities: number;
  coverage: CoverageMetric;
  activeCoverage: CoverageMetric;
  mappingStateCounts: Record<MappingState, number>;
  mappingTypeCounts: MappingTypeCount[];
  byDomain: MappingCoverageDomainBreakdown[];
}

export interface AnalyticsHeatmapCell {
  domain: string | null;
  lifecycleStatus: LifecycleStatus;
  capabilityCount: number;
  mappedCapabilityCount: number;
  mappedLeafCapabilityCount: number;
  stewardshipCoverageCount: number;
}

export interface AnalyticsGapCapability {
  id: string;
  uniqueName: string;
  domain: string | null;
  lifecycleStatus: LifecycleStatus;
  stewardId: string | null;
  stewardDepartment: string | null;
  updatedAt: string;
}

export interface DeprecatedCapabilityWithActiveMappings
  extends AnalyticsGapCapability {
  activeMappingCount: number;
  systems: string[];
}

export interface GapAnalysisResult {
  summary: {
    unmappedActiveLeafCapabilityCount: number;
    deprecatedCapabilitiesWithActiveMappingsCount: number;
  };
  appliedFilters: {
    domain: string | null;
    limit: number;
  };
  unmappedActiveLeafCapabilities: AnalyticsGapCapability[];
  deprecatedCapabilitiesWithActiveMappings: DeprecatedCapabilityWithActiveMappings[];
}

export interface RecentActivityItem {
  id: string;
  entityType: AuditEntityType;
  entityId: string;
  action: AuditAction;
  actorId: string;
  occurredAt: string;
  summary: string;
}

export interface RecentActivityReport {
  items: RecentActivityItem[];
  totalReturned: number;
}
