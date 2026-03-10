export type {
  Capability,
  CapabilityNameGuardrailWarning,
  CapabilityStewardship,
  CapabilityStewardshipSource,
  CreateCapabilityInput,
  FlaggedCapabilityListResponse,
  FlaggedCapabilityReviewItem,
  UpdateCapabilityInput,
} from './types/capability';

export { CapabilityType, LifecycleStatus } from './types/capability';

export type {
  CapabilityImportColumnDefinition,
  CapabilityImportCommitResult,
  CapabilityImportCreatedCapability,
  CapabilityImportDryRunResult,
  CapabilityImportError,
  CapabilityImportErrorCode,
  CapabilityImportField,
  CapabilityImportRequest,
  CapabilityImportRowPreview,
  CapabilityImportSummary,
  CapabilityImportWarning,
} from './types/capability-import';
export { CapabilityImportFormat } from './types/capability-import';

export type {
  ModelVersion,
  CapabilityVersion,
  CreateModelVersionInput,
  PublishModelVersionInput,
  RollbackModelVersionInput,
  ModelVersionListResponse,
  CapabilityVersionListResponse,
} from './types/model-version';

export {
  BranchType,
  ModelVersionStateEnum,
  CapabilityVersionChangeType,
} from './types/model-version';

export type {
  ChangeRequest,
  ApprovalDecision,
  ChangeRequestAuditEntry,
  CapabilityLock,
  CreateChangeRequestInput,
  ChangeRequestListResponse,
} from './types/change-request';

export { ChangeRequestStatus, ApprovalDecisionOutcome, ChangeRequestType } from './types/change-request';

export type {
  Mapping,
  CreateMappingInput,
  UpdateMappingInput,
  MappingListResponse,
} from './types/mapping';
export { MappingState } from './types/mapping';

export type {
  ImpactAnalysisResult,
  ImpactAnalysisInput,
  ImpactedSystem,
  ImpactedMapping,
  ImpactSummaryData,
} from './types/impact-analysis';
export { ImpactSeverity } from './types/impact-analysis';

// ─── Phase 9A: Auth / RBAC ───────────────────────────────────────────────────

export type {
  User,
  AuthTokenPayload,
  LoginInput,
  LoginResponse,
  CreateUserInput,
  UpdateUserInput,
  UserListResponse,
} from './types/user';
export { UserRole } from './types/user';

// ─── Phase 9B: Audit Trail ───────────────────────────────────────────────────

export type {
  AuditEntry,
  AuditEntryListResponse,
  QueryAuditEntriesInput,
} from './types/audit';
export { AuditEntityType, AuditAction } from './types/audit';

// ─── Phase 9B: Notifications & Tasks ────────────────────────────────────────

export type {
  TaskOrNotification,
  NotificationListResponse,
  QueryNotificationsInput,
} from './types/notification';
export { NotificationEventType, NotificationStatus } from './types/notification';

// ─── Phase 10: Integration & Downstream Publishing ───────────────────────────

export type {
  DownstreamConsumer,
  DownstreamConsumerEventLogEntry,
  DownstreamConsumerEventLogResponse,
  DownstreamConsumerHealthSummary,
  DownstreamConsumerListResponse,
  DownstreamConsumerStatusSummary,
  CreateDownstreamConsumerInput,
  PublishEvent,
  PublishEventListResponse,
  PublishedCapabilityListResponse,
  PublishedCapabilitySubtreeResponse,
  ReleaseDiffEntry,
  ReleaseDiffResponse,
  TransformationProfileListResponse,
  TransformationProfileSummary,
  UpdateDownstreamConsumerInput,
} from './types/integration';
export { DeliveryStatus, HealthStatus } from './types/integration';

// ─── Phase 12: Analytics & Gap Analysis ──────────────────────────────────────

export type {
  AnalyticsGapCapability,
  AnalyticsHeatmapCell,
  AnalyticsResponse,
  CoverageMetric,
  DeprecatedCapabilityWithActiveMappings,
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
} from './types/analytics';

// ─── Phase 12: Export & Reporting ──────────────────────────────────────────────

export type {
  CapabilityExportMetadata,
  CapabilityExportQuery,
  CapabilityExportResponse,
  ExportedCapability,
  ExportedModelVersion,
  CapabilityFullModelExportData,
  CapabilitySubtreeExportData,
} from './types/export';
export { CapabilityExportScope, ExportFormat } from './types/export';

