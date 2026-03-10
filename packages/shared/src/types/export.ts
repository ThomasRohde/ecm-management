import type { Capability } from './capability';

export enum ExportFormat {
  CSV = 'CSV',
  JSON = 'JSON',
}

export enum CapabilityExportScope {
  FILTERED_CAPABILITIES = 'FILTERED_CAPABILITIES',
  FULL_MODEL = 'FULL_MODEL',
  SUBTREE = 'SUBTREE',
}

export interface CapabilityExportQuery {
  search?: string;
  domain?: string;
  lifecycleStatus?: Capability['lifecycleStatus'];
  type?: Capability['type'];
  parentId?: string;
  tags?: string[];
}

export interface CapabilityExportMetadata {
  generatedAt: string;
  format: ExportFormat;
  scope: CapabilityExportScope;
  filename: string;
}

export interface CapabilityExportResponse<T> {
  data: T;
  meta: CapabilityExportMetadata;
}

export interface ExportedModelVersion {
  id: string;
  versionLabel: string;
  state: 'DRAFT' | 'PUBLISHED' | 'ROLLED_BACK';
  baseVersionId: string | null;
  branchType: 'MAIN' | 'WHAT_IF';
  branchName: string | null;
  description: string | null;
  notes: string | null;
  createdBy: string;
  approvedBy: string | null;
  publishedAt: string | null;
  rollbackOfVersionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface ExportedCapability {
  id: string;
  uniqueName: string;
  aliases: string[];
  description: string | null;
  domain: string | null;
  type: 'ABSTRACT' | 'LEAF';
  parentId: string | null;
  lifecycleStatus: 'DRAFT' | 'ACTIVE' | 'DEPRECATED' | 'RETIRED';
  effectiveFrom: string | null;
  effectiveTo: string | null;
  rationale: string | null;
  sourceReferences: string[];
  tags: string[];
  stewardId: string | null;
  stewardDepartment: string | null;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
  isErroneous: boolean;
  erroneousReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CapabilityFullModelExportData {
  release: ExportedModelVersion;
  items: ExportedCapability[];
  total: number;
}

export interface CapabilitySubtreeExportData extends CapabilityFullModelExportData {
  rootCapabilityId: string;
}
