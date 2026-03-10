import type { CapabilityType, LifecycleStatus } from './capability';

export enum CapabilityImportFormat {
  CSV = 'CSV',
}

export type CapabilityImportField =
  | 'uniqueName'
  | 'parentUniqueName'
  | 'description'
  | 'domain'
  | 'type'
  | 'lifecycleStatus'
  | 'aliases'
  | 'tags'
  | 'sourceReferences'
  | 'rationale'
  | 'stewardId'
  | 'stewardDepartment'
  | 'effectiveFrom'
  | 'effectiveTo'
  | 'nameGuardrailOverride'
  | 'nameGuardrailOverrideRationale';

export interface CapabilityImportColumnDefinition {
  name: CapabilityImportField;
  required: boolean;
  multiValue: boolean;
  description: string;
}

export type CapabilityImportErrorCode =
  | 'REQUIRED'
  | 'DUPLICATE_IN_FILE'
  | 'EXISTING_CONFLICT'
  | 'INVALID_PARENT'
  | 'INVALID_ENUM'
  | 'INVALID_BOOLEAN'
  | 'INVALID_DATE'
  | 'ACTIVE_METADATA_REQUIRED'
  | 'GUARDRAIL_OVERRIDE_RATIONALE_REQUIRED'
  | 'INVALID_HIERARCHY_TYPE'
  | 'CYCLIC_PARENT';

export interface CapabilityImportRequest {
  format: CapabilityImportFormat;
  csvContent: string;
}

export interface CapabilityImportRowPreview {
  rowNumber: number;
  uniqueName: string;
  parentUniqueName: string | null;
  action: 'CREATE';
  type: CapabilityType;
  lifecycleStatus: LifecycleStatus;
}

export interface CapabilityImportError {
  rowNumber: number;
  field: CapabilityImportField;
  code: CapabilityImportErrorCode;
  message: string;
}

export interface CapabilityImportWarning {
  rowNumber: number;
  field: 'uniqueName';
  code: 'CAPABILITY_NAME_GUARDRAIL';
  message: string;
  matchedTerms: string[];
  overrideApplied: boolean;
  overrideRationale: string | null;
}

export interface CapabilityImportSummary {
  totalRows: number;
  readyCount: number;
  invalidRows: number;
  createdCount: number;
}

export interface CapabilityImportDryRunResult {
  format: CapabilityImportFormat;
  supportedColumns: CapabilityImportColumnDefinition[];
  multiValueDelimiter: '|';
  canCommit: boolean;
  summary: CapabilityImportSummary;
  rows: CapabilityImportRowPreview[];
  errors: CapabilityImportError[];
  warnings: CapabilityImportWarning[];
}

export interface CapabilityImportCreatedCapability {
  rowNumber: number;
  capabilityId: string;
  uniqueName: string;
  parentUniqueName: string | null;
}

export interface CapabilityImportCommitResult extends CapabilityImportDryRunResult {
  importId: string;
  created: CapabilityImportCreatedCapability[];
}
