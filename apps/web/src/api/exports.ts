/**
 * Phase 12 Export helpers – browser-side download utilities for the export
 * endpoints protected by AuthenticatedUserGuard.
 *
 * These are plain async functions (not hooks) because they trigger browser
 * downloads as a side-effect rather than managing query state.
 */

import type {
  CapabilityExportQuery,
  CapabilityExportResponse,
  CapabilityFullModelExportData,
  CapabilitySubtreeExportData,
} from '@ecm/shared';
import { ApiError } from './client';
import { getIdentityHeaders } from './identity';

// ─── Internals ────────────────────────────────────────────────────────────────

const API_BASE_URL = (import.meta.env.VITE_API_BASE_URL ?? '/api/v1').replace(/\/$/, '');

function buildUrl(path: string): string {
  return `${API_BASE_URL}${path.startsWith('/') ? path : `/${path}`}`;
}

async function fetchWithAuth(path: string, init?: RequestInit): Promise<Response> {
  const response = await fetch(buildUrl(path), {
    ...init,
    headers: {
      ...getIdentityHeaders(),
      ...(init?.headers as Record<string, string> | undefined),
    },
  });

  if (!response.ok) {
    let details: unknown;
    try {
      details = await response.json();
    } catch {
      // body is not JSON – ignore
    }
    throw new ApiError(response.status, `API error: ${response.statusText}`, details);
  }

  return response;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

function extractFilename(
  contentDisposition: string | null,
  fallback: string,
): string {
  if (!contentDisposition) return fallback;
  // Prefer RFC 5987 encoded filename* over plain filename
  const encodedMatch = /filename\*=(?:UTF-8'')?([^;\s]+)/i.exec(contentDisposition);
  if (encodedMatch?.[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch {
      // fall through
    }
  }
  // Support quoted filenames (including spaces) and unquoted names
  const quotedMatch = /filename="([^"]+)"/i.exec(contentDisposition);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const bareMatch = /filename=([^;\s]+)/i.exec(contentDisposition);
  return bareMatch?.[1] ?? fallback;
}

// ─── Path builders (exported for unit tests) ─────────────────────────────────

export function buildCapabilitiesCsvPath(query?: CapabilityExportQuery): string {
  const params = new URLSearchParams();
  if (query?.search) params.set('search', query.search);
  if (query?.domain) params.set('domain', query.domain);
  if (query?.lifecycleStatus) params.set('lifecycleStatus', query.lifecycleStatus);
  if (query?.type) params.set('type', query.type);
  if (query?.parentId) params.set('parentId', query.parentId);
  if (query?.tags?.length) {
    for (const tag of query.tags) {
      params.append('tags', tag);
    }
  }
  const qs = params.toString();
  return `/exports/capabilities.csv${qs ? `?${qs}` : ''}`;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Triggers a browser download of the capabilities CSV with optional filters.
 */
export async function downloadCapabilitiesCsv(
  query?: CapabilityExportQuery,
): Promise<void> {
  const response = await fetchWithAuth(buildCapabilitiesCsvPath(query));
  const blob = await response.blob();
  const filename = extractFilename(
    response.headers.get('content-disposition'),
    'capabilities.csv',
  );
  triggerDownload(blob, filename);
}

/**
 * Fetches the full current-model JSON export payload.
 * Useful when you need the structured data, e.g. to trigger a JSON download.
 */
export async function fetchCurrentModelExport(): Promise<
  CapabilityExportResponse<CapabilityFullModelExportData>
> {
  const response = await fetchWithAuth('/exports/models/current', {
    headers: { 'Content-Type': 'application/json' },
  });
  return response.json() as Promise<
    CapabilityExportResponse<CapabilityFullModelExportData>
  >;
}

/**
 * Triggers a browser download of the full model as a JSON file.
 */
export async function downloadCurrentModelJson(): Promise<void> {
  const exportData = await fetchCurrentModelExport();
  const json = JSON.stringify(exportData, null, 2);
  const blob = new Blob([json], { type: 'application/json' });
  const filename = exportData.meta.filename ?? 'capabilities-model.json';
  triggerDownload(blob, filename);
}

/**
 * Fetches a capability subtree export by root capability ID.
 */
export async function fetchSubtreeExport(
  id: string,
): Promise<CapabilityExportResponse<CapabilitySubtreeExportData>> {
  const response = await fetchWithAuth(
    `/exports/models/current/subtree/${encodeURIComponent(id)}`,
    { headers: { 'Content-Type': 'application/json' } },
  );
  return response.json() as Promise<
    CapabilityExportResponse<CapabilitySubtreeExportData>
  >;
}
