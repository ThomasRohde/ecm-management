export enum CapabilityType {
  ABSTRACT = 'ABSTRACT',
  LEAF = 'LEAF',
}

export enum LifecycleStatus {
  DRAFT = 'DRAFT',
  ACTIVE = 'ACTIVE',
  DEPRECATED = 'DEPRECATED',
  RETIRED = 'RETIRED',
}

export interface Capability {
  id: string;
  uniqueName: string;
  aliases: string[];
  description: string | null;
  domain: string | null;
  type: CapabilityType;
  parentId: string | null;
  lifecycleStatus: LifecycleStatus;
  effectiveFrom: string | null;
  effectiveTo: string | null;
  rationale: string | null;
  sourceReferences: string[];
  tags: string[];
  stewardId: string | null;
  stewardDepartment: string | null;
  nameGuardrailOverride?: boolean;
  nameGuardrailOverrideRationale?: string | null;
  guardrailWarnings?: CapabilityNameGuardrailWarning[];
  /** True when the capability has been explicitly flagged as clearly erroneous. */
  isErroneous: boolean;
  /** Human-readable rationale explaining why the capability is considered erroneous. */
  erroneousReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateCapabilityInput {
  uniqueName: string;
  aliases?: string[];
  description?: string;
  domain?: string;
  type?: CapabilityType;
  lifecycleStatus?: LifecycleStatus;
  parentId?: string;
  effectiveFrom?: string;
  effectiveTo?: string;
  rationale?: string;
  sourceReferences?: string[];
  tags?: string[];
  stewardId?: string;
  stewardDepartment?: string;
  nameGuardrailOverride?: boolean;
  nameGuardrailOverrideRationale?: string;
}

export interface UpdateCapabilityInput {
  uniqueName?: string;
  aliases?: string[];
  description?: string | null;
  domain?: string | null;
  type?: CapabilityType;
  lifecycleStatus?: LifecycleStatus;
  effectiveFrom?: string | null;
  effectiveTo?: string | null;
  rationale?: string | null;
  sourceReferences?: string[];
  tags?: string[];
  stewardId?: string | null;
  stewardDepartment?: string | null;
  nameGuardrailOverride?: boolean;
  nameGuardrailOverrideRationale?: string | null;
  parentId?: string | null;
  /** Mark or unmark this capability as clearly erroneous. */
  isErroneous?: boolean;
  /** Rationale required when setting isErroneous to true. */
  erroneousReason?: string | null;
}

export interface CapabilityNameGuardrailWarning {
  code: 'CAPABILITY_NAME_GUARDRAIL';
  message: string;
  matchedTerms: string[];
  overrideApplied: boolean;
  overrideRationale: string | null;
}

export interface FlaggedCapabilityReviewItem {
  id: string;
  uniqueName: string;
  lifecycleStatus: LifecycleStatus;
  domain: string | null;
  stewardId: string | null;
  stewardDepartment: string | null;
  updatedAt: string;
  nameGuardrailOverride: boolean;
  nameGuardrailOverrideRationale: string | null;
  matchedTerms: string[];
  warningMessage: string;
}

export interface FlaggedCapabilityListResponse {
  items: FlaggedCapabilityReviewItem[];
  page: number;
  limit: number;
  hasMore: boolean;
}

export type CapabilityStewardshipSource = 'DIRECT' | 'INHERITED' | 'UNASSIGNED';

export interface CapabilityStewardship {
  capabilityId: string;
  stewardId: string | null;
  stewardDepartment: string | null;
  source: CapabilityStewardshipSource;
  sourceCapabilityId: string | null;
}
