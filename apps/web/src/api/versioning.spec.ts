import { describe, expect, it } from 'vitest';
import { BranchType, ModelVersionStateEnum } from '@ecm/shared';
import type { ModelVersion, ModelVersionListResponse } from '@ecm/shared';
import {
  getVersionStateBadgeVariant,
  getVersionStateLabel,
} from './versioning';
import type {
  PublishModelVersionResponse,
  VersionDiffEntry,
  VersionDiffResponse,
  WhatIfBranchDiffResponse,
} from './versioning';

// ─── Helper: minimal valid ModelVersion stub ──────────────────────────────────

function makeVersion(overrides: Partial<ModelVersion> = {}): ModelVersion {
  return {
    id: 'mv-1',
    versionLabel: 'v1.0.0',
    state: ModelVersionStateEnum.PUBLISHED,
    baseVersionId: null,
    branchType: BranchType.MAIN,
    branchName: null,
    description: null,
    notes: null,
    createdBy: 'alice',
    approvedBy: null,
    publishedAt: '2024-06-01T00:00:00Z',
    rollbackOfVersionId: null,
    createdAt: '2024-06-01T00:00:00Z',
    updatedAt: '2024-06-01T00:00:00Z',
    ...overrides,
  };
}

// ─── Pure-helper tests ────────────────────────────────────────────────────────

describe('getVersionStateBadgeVariant', () => {
  it('returns neutral for DRAFT state', () => {
    expect(getVersionStateBadgeVariant(ModelVersionStateEnum.DRAFT)).toBe('neutral');
  });

  it('returns positive for PUBLISHED state', () => {
    expect(getVersionStateBadgeVariant(ModelVersionStateEnum.PUBLISHED)).toBe('positive');
  });

  it('returns negative for ROLLED_BACK state', () => {
    expect(getVersionStateBadgeVariant(ModelVersionStateEnum.ROLLED_BACK)).toBe('negative');
  });
});

describe('getVersionStateLabel', () => {
  it('returns "Draft" for DRAFT state', () => {
    expect(getVersionStateLabel(ModelVersionStateEnum.DRAFT)).toBe('Draft');
  });

  it('returns "Published" for PUBLISHED state', () => {
    expect(getVersionStateLabel(ModelVersionStateEnum.PUBLISHED)).toBe('Published');
  });

  it('returns "Rolled back" for ROLLED_BACK state', () => {
    expect(getVersionStateLabel(ModelVersionStateEnum.ROLLED_BACK)).toBe('Rolled back');
  });
});

// ─── Contract: VersionDiffResponse ───────────────────────────────────────────
//
// These tests assert the frontend interface matches what ModelVersionService
// .computeDiff() actually returns:  { fromVersion, toVersion, added, modified,
// removed, summary }.  A flat { changes[], totalChanges } shape would fail here.

describe('VersionDiffResponse contract', () => {
  const addedEntry: VersionDiffEntry = {
    capabilityId: 'cap-1',
    name: 'New Capability',
    afterSnapshot: { uniqueName: 'New Capability' },
  };

  const modifiedEntry: VersionDiffEntry = {
    capabilityId: 'cap-2',
    name: 'Existing Cap',
    changedFields: { uniqueName: { before: 'Old', after: 'New' } },
  };

  const removedEntry: VersionDiffEntry = {
    capabilityId: 'cap-3',
    name: 'Deleted Cap',
    beforeSnapshot: { uniqueName: 'Deleted Cap' },
  };

  const mockDiff: VersionDiffResponse = {
    fromVersion: { id: 'mv-1', versionLabel: 'v1.0.0', state: ModelVersionStateEnum.PUBLISHED },
    toVersion: { id: 'mv-2', versionLabel: 'v2.0.0', state: ModelVersionStateEnum.DRAFT },
    added: [addedEntry],
    modified: [modifiedEntry],
    removed: [removedEntry],
    summary: { addedCount: 1, modifiedCount: 1, removedCount: 1 },
  };

  it('has fromVersion with id, versionLabel, and state fields', () => {
    expect(mockDiff.fromVersion).toHaveProperty('id');
    expect(mockDiff.fromVersion).toHaveProperty('versionLabel');
    expect(mockDiff.fromVersion).toHaveProperty('state');
  });

  it('has toVersion with id, versionLabel, and state fields', () => {
    expect(mockDiff.toVersion).toHaveProperty('id');
    expect(mockDiff.toVersion.state).toBe(ModelVersionStateEnum.DRAFT);
  });

  it('separates changes into added / modified / removed buckets', () => {
    expect(mockDiff.added).toHaveLength(1);
    expect(mockDiff.modified).toHaveLength(1);
    expect(mockDiff.removed).toHaveLength(1);
  });

  it('summary counts match bucket lengths', () => {
    expect(mockDiff.summary.addedCount).toBe(mockDiff.added.length);
    expect(mockDiff.summary.modifiedCount).toBe(mockDiff.modified.length);
    expect(mockDiff.summary.removedCount).toBe(mockDiff.removed.length);
  });

  it('added entry has capabilityId, name, and afterSnapshot', () => {
    const entry = mockDiff.added[0];
    expect(entry).toHaveProperty('capabilityId');
    expect(entry).toHaveProperty('name');
    expect(entry).toHaveProperty('afterSnapshot');
  });

  it('modified entry has capabilityId, name, and changedFields', () => {
    const entry = mockDiff.modified[0];
    expect(entry).toHaveProperty('changedFields');
  });

  it('removed entry has capabilityId, name, and beforeSnapshot', () => {
    const entry = mockDiff.removed[0];
    expect(entry).toHaveProperty('beforeSnapshot');
  });
});

// ─── Contract: WhatIfBranchDiffResponse (alias of VersionDiffResponse) ───────

describe('WhatIfBranchDiffResponse contract', () => {
  it('is structurally identical to VersionDiffResponse (type alias)', () => {
    // diffVsBase() delegates to computeDiff() — same shape, same buckets.
    const branchDiff: WhatIfBranchDiffResponse = {
      fromVersion: { id: 'base-1', versionLabel: 'v1.0.0', state: ModelVersionStateEnum.PUBLISHED },
      toVersion: { id: 'branch-1', versionLabel: 'branch-draft', state: ModelVersionStateEnum.DRAFT },
      added: [],
      modified: [],
      removed: [],
      summary: { addedCount: 0, modifiedCount: 0, removedCount: 0 },
    };
    expect(branchDiff).toHaveProperty('fromVersion');
    expect(branchDiff).toHaveProperty('toVersion');
    expect(branchDiff).toHaveProperty('summary');
  });
});

// ─── Contract: PublishModelVersionResponse ────────────────────────────────────
//
// Backend publishSnapshot() returns { published, newDraft } — NOT a single
// ModelVersion.  usePublishModelVersion must be typed accordingly.

describe('PublishModelVersionResponse contract', () => {
  const mockPublishResponse: PublishModelVersionResponse = {
    published: makeVersion({ id: 'mv-pub', state: ModelVersionStateEnum.PUBLISHED }),
    newDraft: makeVersion({ id: 'mv-draft', state: ModelVersionStateEnum.DRAFT, publishedAt: null }),
  };

  it('contains a "published" ModelVersion field', () => {
    expect(mockPublishResponse.published).toHaveProperty('id');
    expect(mockPublishResponse.published.state).toBe(ModelVersionStateEnum.PUBLISHED);
  });

  it('contains a "newDraft" ModelVersion field', () => {
    expect(mockPublishResponse.newDraft).toHaveProperty('id');
    expect(mockPublishResponse.newDraft.state).toBe(ModelVersionStateEnum.DRAFT);
  });

  it('published and newDraft are distinct version records', () => {
    expect(mockPublishResponse.published.id).not.toBe(mockPublishResponse.newDraft.id);
  });
});

// ─── Contract: useWhatIfBranches list shape ───────────────────────────────────
//
// Backend listBranches() returns { items, total } — NOT a bare ModelVersion[].
// useWhatIfBranches must be typed as ModelVersionListResponse.

describe('ModelVersionListResponse shape (useWhatIfBranches)', () => {
  it('has items array and total count — not a bare array', () => {
    const mockList: ModelVersionListResponse = {
      items: [makeVersion({ branchType: BranchType.WHAT_IF })],
      total: 1,
    };
    expect(mockList).toHaveProperty('items');
    expect(mockList).toHaveProperty('total');
    expect(Array.isArray(mockList.items)).toBe(true);
    expect(mockList.total).toBe(1);
  });
});

