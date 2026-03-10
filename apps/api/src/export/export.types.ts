import type {
  CapabilityExportScope as SharedCapabilityExportScope,
  ExportFormat as SharedExportFormat,
  CapabilityExportMetadata,
  CapabilityExportQuery,
  CapabilityExportResponse,
  ExportedCapability,
  ExportedModelVersion,
  CapabilityFullModelExportData,
  CapabilitySubtreeExportData,
} from '@ecm/shared';

export const ExportFormat = {
  CSV: 'CSV' as SharedExportFormat,
  JSON: 'JSON' as SharedExportFormat,
} as const;

export const CapabilityExportScope = {
  FILTERED_CAPABILITIES: 'FILTERED_CAPABILITIES' as SharedCapabilityExportScope,
  FULL_MODEL: 'FULL_MODEL' as SharedCapabilityExportScope,
  SUBTREE: 'SUBTREE' as SharedCapabilityExportScope,
} as const;

export type ExportFormat = SharedExportFormat;
export type CapabilityExportScope = SharedCapabilityExportScope;

export type {
  CapabilityExportMetadata,
  CapabilityExportQuery,
  CapabilityExportResponse,
  ExportedCapability,
  ExportedModelVersion,
  CapabilityFullModelExportData,
  CapabilitySubtreeExportData,
};

export interface CapabilityCsvExportFile {
  filename: string;
  content: string;
  generatedAt: string;
  total: number;
}
