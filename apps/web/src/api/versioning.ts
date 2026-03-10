import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CapabilityVersion,
  CapabilityVersionListResponse,
  ModelVersion,
  ModelVersionListResponse,
} from '@ecm/shared';
import { BranchType, CapabilityVersionChangeType, ModelVersionStateEnum } from '@ecm/shared';
import { apiClient } from './client';
import { getIdentityHeaders } from './identity';

// ─── Query key roots ─────────────────────────────────────────────────────────

const MODEL_VERSIONS_KEY = ['model-versions'] as const;
const WHAT_IF_BRANCHES_KEY = ['what-if-branches'] as const;
const CAPABILITY_HISTORY_KEY = ['capability-history'] as const;

// ─── Derived query key factories ─────────────────────────────────────────────

function modelVersionKey(id: string) {
  return [...MODEL_VERSIONS_KEY, 'detail', id] as const;
}

function versionDiffKey(fromId: string, toId: string) {
  return [...MODEL_VERSIONS_KEY, 'diff', fromId, toId] as const;
}

function whatIfBranchKey(branchId: string) {
  return [...WHAT_IF_BRANCHES_KEY, 'detail', branchId] as const;
}

function whatIfBranchDiffKey(branchId: string) {
  return [...WHAT_IF_BRANCHES_KEY, 'diff', branchId] as const;
}

function capabilityHistoryKey(capabilityId: string) {
  return [...CAPABILITY_HISTORY_KEY, capabilityId] as const;
}

// ─── Response / shape extensions ─────────────────────────────────────────────

/**
 * Compact version summary embedded in diff responses.
 * Matches the `fromVersion` / `toVersion` objects returned by
 * `ModelVersionService.computeDiff()`.
 */
export interface VersionDiffSummary {
  id: string;
  versionLabel: string;
  state: ModelVersionStateEnum;
}

/**
 * A single capability entry within a diff bucket (added / modified / removed).
 * Mirrors the `CapabilityDiffEntry` interface from `model-version.service.ts`.
 *
 * Fields present depend on the bucket:
 *  - added:    `afterSnapshot` is populated; no `changedFields`.
 *  - modified: `changedFields` is populated; no snapshots.
 *  - removed:  `beforeSnapshot` is populated; no `changedFields`.
 */
export interface VersionDiffEntry {
  capabilityId: string;
  /** `uniqueName` of the capability at the time of the change. */
  name: string;
  /** Aggregate of all changed fields across the version range (modified entries only). */
  changedFields?: Record<string, unknown>;
  /** Full capability snapshot after the change (added entries). */
  afterSnapshot?: unknown;
  /** Full capability snapshot before the change (removed entries). */
  beforeSnapshot?: unknown;
}

/**
 * Response returned by `GET /model-versions/diff?from=<id>&to=<id>`.
 * Matches the return value of `ModelVersionService.computeDiff()` exactly.
 */
export interface VersionDiffResponse {
  fromVersion: VersionDiffSummary;
  toVersion: VersionDiffSummary;
  /** Capabilities newly created between `fromVersion` and `toVersion`. */
  added: VersionDiffEntry[];
  /** Capabilities updated between `fromVersion` and `toVersion`. */
  modified: VersionDiffEntry[];
  /** Capabilities deleted between `fromVersion` and `toVersion`. */
  removed: VersionDiffEntry[];
  summary: {
    addedCount: number;
    modifiedCount: number;
    removedCount: number;
  };
}

/**
 * Response returned by `GET /what-if-branches/:branchId/diff`.
 * `WhatIfBranchService.diffVsBase()` delegates directly to `computeDiff()`,
 * so the shape is identical to `VersionDiffResponse`.
 */
export type WhatIfBranchDiffResponse = VersionDiffResponse;

// ─── Publish / rollback inputs ────────────────────────────────────────────────

/** Matches CreateSnapshotDto on the API side. */
export interface PublishVersionInput {
  versionLabel: string;
  description?: string;
  notes?: string;
  approvedBy?: string;
  actorId?: string;
}

/** Matches RollbackVersionDto on the API side. */
export interface RollbackVersionInput {
  rollbackOfVersionId: string;
  createdBy?: string;
  notes?: string;
}

/** Matches CreateBranchDto on the API side. */
export interface CreateWhatIfBranchInput {
  branchName: string;
  description?: string;
}

/**
 * Response returned by `POST /model-versions/publish`.
 * Matches `ModelVersionService.publishSnapshot()` which returns both the
 * newly-published version and the fresh DRAFT that succeeds it.
 */
export interface PublishModelVersionResponse {
  /** The version that was just promoted to PUBLISHED state. */
  published: ModelVersion;
  /** The new empty DRAFT opened immediately after publication. */
  newDraft: ModelVersion;
}

// ─── Re-exports for consumers ─────────────────────────────────────────────────

export {
  BranchType,
  CapabilityVersionChangeType,
  ModelVersionStateEnum,
};

// ─── Query hooks — model versions ─────────────────────────────────────────────

/**
 * List published and draft MAIN-branch model versions.
 * Pass `branchType: BranchType.WHAT_IF` to retrieve what-if branch versions instead.
 */
export function useModelVersions(branchType?: BranchType) {
  const queryKey =
    branchType === BranchType.WHAT_IF
      ? ([...MODEL_VERSIONS_KEY, 'list', 'what-if'] as const)
      : ([...MODEL_VERSIONS_KEY, 'list', 'main'] as const);

  const path =
    branchType === BranchType.WHAT_IF
      ? '/model-versions?branchType=WHAT_IF'
      : '/model-versions';

  return useQuery<ModelVersionListResponse, Error>({
    queryKey,
    queryFn: () => apiClient.get<ModelVersionListResponse>(path),
  });
}

/** Get a specific model version by ID. */
export function useModelVersion(id?: string) {
  return useQuery<ModelVersion, Error>({
    queryKey: modelVersionKey(id ?? 'unknown'),
    queryFn: () => apiClient.get<ModelVersion>(`/model-versions/${id}`),
    enabled: !!id,
  });
}

/**
 * Get the current MAIN-branch DRAFT model version.
 * Returns `null` when there is no active draft (the API returns `{ message: 'No active draft' }`).
 */
export function useCurrentDraft() {
  return useQuery<ModelVersion | null, Error>({
    queryKey: [...MODEL_VERSIONS_KEY, 'current-draft'] as const,
    queryFn: async () => {
      const result = await apiClient.get<ModelVersion | { message: string }>(
        '/model-versions/current-draft',
      );
      if ('message' in result) {
        return null;
      }
      return result;
    },
  });
}

/**
 * Compute the diff between two model versions.
 * Both `fromId` and `toId` must be valid UUIDs; the query is disabled if either is absent.
 */
export function useVersionDiff(fromId?: string, toId?: string) {
  return useQuery<VersionDiffResponse, Error>({
    queryKey: versionDiffKey(fromId ?? '', toId ?? ''),
    queryFn: () =>
      apiClient.get<VersionDiffResponse>(
        `/model-versions/diff?from=${fromId}&to=${toId}`,
      ),
    enabled: !!fromId && !!toId,
  });
}

// ─── Query hooks — capability history ─────────────────────────────────────────

/** Per-capability change history via GET /capabilities/:id/history */
export function useCapabilityHistory(capabilityId?: string) {
  return useQuery<CapabilityVersionListResponse, Error>({
    queryKey: capabilityHistoryKey(capabilityId ?? 'unknown'),
    queryFn: () =>
      apiClient.get<CapabilityVersionListResponse>(
        `/capabilities/${capabilityId}/history`,
      ),
    enabled: !!capabilityId,
  });
}

// ─── Query hooks — what-if branches ──────────────────────────────────────────

/** List all what-if branches. */
export function useWhatIfBranches() {
  return useQuery<ModelVersionListResponse, Error>({
    queryKey: [...WHAT_IF_BRANCHES_KEY, 'list'] as const,
    queryFn: () => apiClient.get<ModelVersionListResponse>('/what-if-branches'),
  });
}

/** Get a specific what-if branch by ID. */
export function useWhatIfBranch(branchId?: string) {
  return useQuery<ModelVersion, Error>({
    queryKey: whatIfBranchKey(branchId ?? 'unknown'),
    queryFn: () => apiClient.get<ModelVersion>(`/what-if-branches/${branchId}`),
    enabled: !!branchId,
  });
}

/** Compute the diff between a what-if branch and its base version. */
export function useWhatIfBranchDiff(branchId?: string) {
  return useQuery<WhatIfBranchDiffResponse, Error>({
    queryKey: whatIfBranchDiffKey(branchId ?? 'unknown'),
    queryFn: () =>
      apiClient.get<WhatIfBranchDiffResponse>(
        `/what-if-branches/${branchId}/diff`,
      ),
    enabled: !!branchId,
  });
}

// ─── Mutation hooks — model versions ─────────────────────────────────────────

/**
 * Publish the current MAIN DRAFT as a named release snapshot.
 * Requires the `curator` role.
 */
export function usePublishModelVersion() {
  const queryClient = useQueryClient();

  return useMutation<PublishModelVersionResponse, Error, PublishVersionInput>({
    mutationFn: (input) =>
      apiClient.post<PublishModelVersionResponse>(
        '/model-versions/publish',
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MODEL_VERSIONS_KEY });
    },
  });
}

/**
 * Create a new DRAFT by rolling back to a prior published version.
 * Requires the `curator` role.
 */
export function useRollbackModelVersion() {
  const queryClient = useQueryClient();

  return useMutation<ModelVersion, Error, RollbackVersionInput>({
    mutationFn: (input) =>
      apiClient.post<ModelVersion>(
        '/model-versions/rollback',
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: MODEL_VERSIONS_KEY });
    },
  });
}

// ─── Mutation hooks — what-if branches ───────────────────────────────────────

/**
 * Create a new what-if branch forked from the current MAIN DRAFT.
 * Requires the `curator` role.
 */
export function useCreateWhatIfBranch() {
  const queryClient = useQueryClient();

  return useMutation<ModelVersion, Error, CreateWhatIfBranchInput>({
    mutationFn: (input) =>
      apiClient.post<ModelVersion>(
        '/what-if-branches',
        input,
        getIdentityHeaders(),
      ),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: WHAT_IF_BRANCHES_KEY });
    },
  });
}

/**
 * Discard (soft-delete) a what-if branch.
 * Requires the `curator` role.
 */
export function useDiscardWhatIfBranch() {
  const queryClient = useQueryClient();

  return useMutation<ModelVersion, Error, string>({
    mutationFn: (branchId) =>
      apiClient.delete<ModelVersion>(
        `/what-if-branches/${branchId}`,
        getIdentityHeaders(),
      ),
    onSuccess: (_data, branchId) => {
      queryClient.removeQueries({ queryKey: whatIfBranchKey(branchId) });
      queryClient.removeQueries({ queryKey: whatIfBranchDiffKey(branchId) });
      void queryClient.invalidateQueries({ queryKey: WHAT_IF_BRANCHES_KEY });
    },
  });
}

// ─── Helpers ─────────────────────────────────────────────────────────────────

/**
 * Maps a `ModelVersionStateEnum` to the Sapphire badge variant string.
 * Useful for rendering consistent status badges across versioning surfaces.
 *
 * @param state - The model version state.
 * @returns A Sapphire badge variant: `'neutral'`, `'positive'`, or `'negative'`.
 */
export function getVersionStateBadgeVariant(
  state: ModelVersionStateEnum,
): 'neutral' | 'positive' | 'negative' {
  switch (state) {
    case ModelVersionStateEnum.DRAFT:
      return 'neutral';
    case ModelVersionStateEnum.PUBLISHED:
      return 'positive';
    case ModelVersionStateEnum.ROLLED_BACK:
      return 'negative';
  }
}

/**
 * Returns the display label for a model version state.
 */
export function getVersionStateLabel(state: ModelVersionStateEnum): string {
  switch (state) {
    case ModelVersionStateEnum.DRAFT:
      return 'Draft';
    case ModelVersionStateEnum.PUBLISHED:
      return 'Published';
    case ModelVersionStateEnum.ROLLED_BACK:
      return 'Rolled back';
  }
}

export type { ModelVersion, CapabilityVersion, ModelVersionListResponse, CapabilityVersionListResponse };
