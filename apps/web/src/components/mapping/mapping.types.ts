/**
 * Component-level mapping domain types for Phase 8 UI.
 *
 * `MappingState` is re-exported from `@ecm/shared` so all components stay
 * aligned with the backend contract.  `mappingType` is a free-form string
 * per the shared contract — the server accepts any categorisation string
 * (e.g. "CONSUMES", "MANAGES", "READS").
 *
 * Impact-analysis types (ImpactAnalysisResult, ImpactedMapping, etc.) are
 * now imported directly from `@ecm/shared` — the provisional local versions
 * defined here in Phase 8 mapping-components work have been removed in favour
 * of the shared contract established by phase8-impact-backend.
 */
import type { Mapping } from '@ecm/shared';
import { MappingState } from '@ecm/shared';

// Re-export for convenient single-import in component files.
export { MappingState };
export type { Mapping };

/**
 * Display-enriched mapping record.  Extends the shared `Mapping` with
 * denormalised display labels that list endpoints should include.
 */
export interface MappingDisplayDto extends Mapping {
  systemName: string;      // Human-readable name of the owning system.
  capabilityName: string;  // Human-readable name of the mapped capability.
}

/** Values collected by the Add / Edit mapping form. */
export interface MappingFormValues {
  systemId: string;
  systemName: string;
  mappingType: string;  // Free-form integration category, e.g. "CONSUMES", "MANAGES", "READS".
  state: MappingState;
  notes: string;  // Optional free-form notes stored in attributes.notes on submit.
}
