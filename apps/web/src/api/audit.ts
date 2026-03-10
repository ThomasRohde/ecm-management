import { useQuery } from '@tanstack/react-query';
import type { AuditEntryListResponse, QueryAuditEntriesInput } from '@ecm/shared';
import { AuditAction, AuditEntityType } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

const AUDIT_KEY = ['audit'] as const;

function buildAuditPath(params?: QueryAuditEntriesInput | null): string {
  const searchParams = new URLSearchParams();

  if (params?.entityType) {
    searchParams.set('entityType', params.entityType);
  }

  if (params?.entityId) {
    searchParams.set('entityId', params.entityId);
  }

  if (params?.actorId) {
    searchParams.set('actorId', params.actorId);
  }

  if (params?.action) {
    searchParams.set('action', params.action);
  }

  if (params?.fromDate) {
    searchParams.set('fromDate', params.fromDate);
  }

  if (params?.toDate) {
    searchParams.set('toDate', params.toDate);
  }

  if (params?.limit != null) {
    searchParams.set('limit', String(params.limit));
  }

  if (params?.offset != null) {
    searchParams.set('offset', String(params.offset));
  }

  const query = searchParams.toString();
  return query ? `/audit?${query}` : '/audit';
}

export function useAuditEntries(
  params?: QueryAuditEntriesInput | null,
  enabled = true,
) {
  return useQuery<AuditEntryListResponse, Error>({
    queryKey: [...AUDIT_KEY, 'list', params] as const,
    queryFn: () =>
      apiClient.get<AuditEntryListResponse>(buildAuditPath(params), getIdentityHeaders()),
    enabled,
  });
}

export { AuditAction, AuditEntityType };
