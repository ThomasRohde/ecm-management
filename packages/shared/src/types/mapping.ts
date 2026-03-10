// ─── Mapping shared types ──────────────────────────────────────────────────────
//
// "Mapping" represents the "System implements Capability" relationship.
// These types are shared between the API and the web frontend so that both
// sides share a single, stable contract.

export enum MappingState {
  ACTIVE = 'ACTIVE',
  INACTIVE = 'INACTIVE',
  PENDING = 'PENDING',
}

/**
 * A Mapping links a system (identified by systemId) to a Capability node.
 * mappingType is a free-form string that callers use to categorise the
 * integration style (e.g. "CONSUMES", "PRODUCES", "MANAGES", "READS").
 * attributes carries any system-specific metadata as an open JSON bag.
 */
export interface Mapping {
  id: string;
  mappingType: string;
  systemId: string;
  capabilityId: string;
  state: MappingState;
  attributes: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface CreateMappingInput {
  mappingType: string;
  systemId: string;
  capabilityId: string;
  state?: MappingState;
  attributes?: Record<string, unknown>;
}

export interface UpdateMappingInput {
  mappingType?: string;
  state?: MappingState;
  attributes?: Record<string, unknown>;
}

export interface MappingListResponse {
  items: Mapping[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}
