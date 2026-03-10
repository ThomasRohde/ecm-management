import { useState } from 'react';
import type { ModelVersion } from '@ecm/shared';
import { CapabilityVersionChangeType } from '@ecm/shared';
import {
  ModelVersionStateEnum,
  useCurrentDraft,
  useModelVersions,
  usePublishModelVersion,
  useRollbackModelVersion,
  useVersionDiff,
} from '../api/versioning';
import type { VersionDiffEntry, VersionDiffResponse } from '../api/versioning';
import { ReleaseStatusBadge } from '../components/versioning/ReleaseStatusBadge';
import { RollbackConfirmDialog } from '../components/versioning/RollbackConfirmDialog';
import { VersionDiffView } from '../components/versioning/VersionDiffView';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { getUserId } from '../api/identity';
import { canManageReleases, getPermissionDeniedMessage } from '../auth/permissions';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatDateTime(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function ReleaseDashboardLoadingState() {
  return (
    <div
      className="sapphire-stack sapphire-stack--gap-xl"
      role="status"
      aria-label="Loading release dashboard"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <LoadingSkeleton width="8rem" height="1.75rem" />
        <LoadingSkeleton width="22rem" height="1rem" />
      </div>
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <LoadingSkeleton width="10rem" height="1.25rem" />
        <LoadingSkeleton width="100%" height="2rem" />
        <LoadingSkeleton width="80%" height="1rem" />
      </div>
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <LoadingSkeleton width="10rem" height="1.25rem" />
        <LoadingSkeleton width="100%" height="3rem" />
        <LoadingSkeleton width="100%" height="3rem" />
      </div>
    </div>
  );
}

// ─── Diff section ─────────────────────────────────────────────────────────────

interface DiffEntryRowProps {
  entry: VersionDiffEntry;
  bucket: 'added' | 'modified' | 'removed';
}

function DiffEntryRow({ entry, bucket }: DiffEntryRowProps) {
  const [expanded, setExpanded] = useState(false);

  const changeType =
    bucket === 'added'
      ? CapabilityVersionChangeType.CREATE
      : bucket === 'removed'
        ? CapabilityVersionChangeType.DELETE
        : CapabilityVersionChangeType.UPDATE;

  const badgeVariant =
    bucket === 'added' ? 'positive' : bucket === 'removed' ? 'negative' : 'accent';

  const bucketLabel =
    bucket === 'added' ? 'Added' : bucket === 'removed' ? 'Removed' : 'Modified';

  return (
    <div
      className="sapphire-stack sapphire-stack--gap-xs"
      style={{ paddingBottom: 'var(--sapphire-semantic-size-spacing-xs)' }}
    >
      <div
        className="sapphire-row sapphire-row--gap-sm"
        style={{ alignItems: 'center', justifyContent: 'space-between' }}
      >
        <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'center' }}>
          <span className={`sapphire-badge sapphire-badge--sm sapphire-badge--${badgeVariant}`}>
            {bucketLabel}
          </span>
          <span className="sapphire-text sapphire-text--body-sm">{entry.name}</span>
        </div>
        <button
          type="button"
          className="sapphire-button sapphire-button--text sapphire-button--sm"
          aria-expanded={expanded}
          aria-label={`${expanded ? 'Collapse' : 'Expand'} diff for ${entry.name}`}
          onClick={() => setExpanded((v) => !v)}
        >
          <span className="sapphire-button__content">{expanded ? '▲ Hide' : '▼ Details'}</span>
        </button>
      </div>

      {expanded && (
        <div style={{ paddingLeft: 'var(--sapphire-semantic-size-spacing-md)' }}>
          <VersionDiffView
            changeType={changeType}
            changedFields={entry.changedFields ?? {}}
            beforeSnapshot={
              (entry.beforeSnapshot as Record<string, unknown> | null) ?? null
            }
            afterSnapshot={
              (entry.afterSnapshot as Record<string, unknown> | null) ?? null
            }
            capabilityName={entry.name}
          />
        </div>
      )}
    </div>
  );
}

interface DiffBucketSectionProps {
  label: string;
  count: number;
  entries: VersionDiffEntry[];
  bucket: 'added' | 'modified' | 'removed';
  badgeVariant: string;
}

function DiffBucketSection({ label, count, entries, bucket, badgeVariant }: DiffBucketSectionProps) {
  const [open, setOpen] = useState(false);

  if (count === 0) return null;

  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <button
        type="button"
        className="sapphire-button sapphire-button--text sapphire-button--sm"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        style={{ justifyContent: 'flex-start' }}
      >
        <span className="sapphire-button__content sapphire-row sapphire-row--gap-sm">
          <span className={`sapphire-badge sapphire-badge--${badgeVariant}`}>
            {count} {label}
          </span>
          <span>{open ? '▲ Hide' : '▼ Show'}</span>
        </span>
      </button>

      {open && (
        <div
          className="sapphire-stack sapphire-stack--gap-sm"
          style={{
            paddingLeft: 'var(--sapphire-semantic-size-spacing-md)',
            borderLeft: '2px solid var(--sapphire-semantic-color-border-subtle)',
          }}
        >
          {entries.map((entry) => (
            <DiffEntryRow key={entry.capabilityId} entry={entry} bucket={bucket} />
          ))}
        </div>
      )}
    </div>
  );
}

interface DiffSummarySectionProps {
  diff: VersionDiffResponse;
  fromLabel: string;
  toLabel: string;
}

function DiffSummarySection({ diff, fromLabel, toLabel }: DiffSummarySectionProps) {
  const total =
    diff.summary.addedCount + diff.summary.modifiedCount + diff.summary.removedCount;

  return (
    <div className="sapphire-stack sapphire-stack--gap-md">
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        Comparing <strong>{fromLabel}</strong> → <strong>{toLabel}</strong>
      </p>

      {total === 0 ? (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No capability changes between these versions.
        </p>
      ) : (
        <div className="sapphire-stack sapphire-stack--gap-sm">
          <DiffBucketSection
            label="added"
            count={diff.summary.addedCount}
            entries={diff.added}
            bucket="added"
            badgeVariant="positive"
          />
          <DiffBucketSection
            label="modified"
            count={diff.summary.modifiedCount}
            entries={diff.modified}
            bucket="modified"
            badgeVariant="accent"
          />
          <DiffBucketSection
            label="removed"
            count={diff.summary.removedCount}
            entries={diff.removed}
            bucket="removed"
            badgeVariant="negative"
          />
        </div>
      )}
    </div>
  );
}

// ─── Version history row ──────────────────────────────────────────────────────

interface VersionHistoryRowProps {
  version: ModelVersion;
  onRollback?: (version: ModelVersion) => void;
}

function VersionHistoryRow({ version, onRollback }: VersionHistoryRowProps) {
  const canRollback = version.state === ModelVersionStateEnum.PUBLISHED && onRollback;
  const displayDate = version.publishedAt ?? version.createdAt;

  return (
    <div
      className="sapphire-row sapphire-row--gap-md"
      style={{
        padding: 'var(--sapphire-semantic-size-spacing-sm) 0',
        borderBottom: '1px solid var(--sapphire-semantic-color-border-subtle)',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
      }}
      data-testid="version-history-row"
    >
      <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'center' }}>
        <ReleaseStatusBadge state={version.state} size="sm" />
        <span className="sapphire-text sapphire-text--body-sm">
          <strong>{version.versionLabel}</strong>
        </span>
        {version.description && (
          <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            — {version.description}
          </span>
        )}
      </div>

      <div
        className="sapphire-row sapphire-row--gap-md"
        style={{ alignItems: 'center', flexWrap: 'wrap' }}
      >
        <div className="sapphire-stack sapphire-stack--gap-xs" style={{ textAlign: 'right' }}>
          <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            {formatDateTime(displayDate)}
          </span>
          <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            by {version.createdBy}
          </span>
        </div>

        {canRollback && (
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            aria-label={`Rollback to version ${version.versionLabel}`}
            onClick={() => onRollback(version)}
          >
            <span className="sapphire-button__content">Rollback to this…</span>
          </button>
        )}
      </div>
    </div>
  );
}

// ─── Publish form ─────────────────────────────────────────────────────────────

interface PublishFormProps {
  isPending: boolean;
  error: Error | null;
  onSubmit: (label: string, description: string, notes: string, approvedBy: string) => void;
  onCancel: () => void;
}

function PublishForm({ isPending, error, onSubmit, onCancel }: PublishFormProps) {
  const [versionLabel, setVersionLabel] = useState('');
  const [description, setDescription] = useState('');
  const [notes, setNotes] = useState('');
  const [labelError, setLabelError] = useState('');
  const [approvedBy, setApprovedBy] = useState(() => getUserId());
  const [reviewConfirmed, setReviewConfirmed] = useState(false);
  const [reviewError, setReviewError] = useState('');

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!versionLabel.trim()) {
      setLabelError('Version label is required.');
      return;
    }
    setLabelError('');
    if (!reviewConfirmed) {
      setReviewError('Please confirm you have reviewed the changes before publishing.');
      return;
    }
    setReviewError('');
    onSubmit(versionLabel.trim(), description.trim(), notes.trim(), approvedBy.trim());
  }

  return (
    <form
      onSubmit={handleSubmit}
      noValidate
      className="sapphire-stack sapphire-stack--gap-md"
      aria-label="Publish release form"
      style={{
        borderTop: '1px solid var(--sapphire-semantic-color-border-subtle)',
        paddingTop: 'var(--sapphire-semantic-size-spacing-md)',
      }}
    >
      <h4 className="sapphire-text sapphire-text--heading-xs">Publish release</h4>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <label className="sapphire-field-label" htmlFor="publish-version-label">
          Version label <span aria-hidden="true">*</span>
        </label>
        <input
          id="publish-version-label"
          className="sapphire-text-field"
          type="text"
          placeholder="e.g. v2.1.0"
          value={versionLabel}
          onChange={(e) => setVersionLabel(e.target.value)}
          disabled={isPending}
          required
          aria-describedby={labelError ? 'publish-label-error' : undefined}
          aria-invalid={labelError ? 'true' : undefined}
        />
        {labelError && (
          <p
            id="publish-label-error"
            role="alert"
            className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
          >
            {labelError}
          </p>
        )}
      </div>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <label className="sapphire-field-label" htmlFor="publish-description">
          Description{' '}
          <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            (optional)
          </span>
        </label>
        <input
          id="publish-description"
          className="sapphire-text-field"
          type="text"
          placeholder="Short description of this release"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <label className="sapphire-field-label" htmlFor="publish-notes">
          Release notes{' '}
          <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            (optional)
          </span>
        </label>
        <textarea
          id="publish-notes"
          className="sapphire-text-field"
          rows={3}
          placeholder="Summarise what changed in this release…"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <label className="sapphire-field-label" htmlFor="publish-approved-by">
          Approved by{' '}
          <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            (optional — pre-filled from the identity banner)
          </span>
        </label>
        <input
          id="publish-approved-by"
          className="sapphire-text-field"
          type="text"
          placeholder="e.g. alice"
          value={approvedBy}
          onChange={(e) => setApprovedBy(e.target.value)}
          disabled={isPending}
        />
      </div>

      <div className="sapphire-stack sapphire-stack--gap-xs">
        <label
          className="sapphire-row sapphire-row--gap-sm"
          style={{ alignItems: 'flex-start', cursor: 'pointer' }}
          htmlFor="publish-review-confirm"
        >
          <input
            id="publish-review-confirm"
            type="checkbox"
            checked={reviewConfirmed}
            onChange={(e) => {
              setReviewConfirmed(e.target.checked);
              if (e.target.checked) setReviewError('');
            }}
            disabled={isPending}
            aria-describedby={reviewError ? 'publish-review-error' : undefined}
            aria-invalid={reviewError ? 'true' : undefined}
          />
          <span className="sapphire-text sapphire-text--body-sm">
            I have reviewed the changes above and confirm this draft is approved for
            publication.
          </span>
        </label>
        {reviewError && (
          <p
            id="publish-review-error"
            role="alert"
            className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
          >
            {reviewError}
          </p>
        )}
      </div>

      {error && (
        <p role="alert" className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
          Failed to publish: {error.message}
        </p>
      )}

      <div className="sapphire-row sapphire-row--gap-sm">
        <button
          type="submit"
          className="sapphire-button sapphire-button--primary sapphire-button--sm"
          disabled={isPending}
        >
          <span className="sapphire-button__content">
            {isPending ? 'Publishing…' : 'Publish'}
          </span>
        </button>
        <button
          type="button"
          className="sapphire-button sapphire-button--secondary sapphire-button--sm"
          onClick={onCancel}
          disabled={isPending}
        >
          <span className="sapphire-button__content">Cancel</span>
        </button>
      </div>
    </form>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

export function ReleaseDashboardPage() {
  const versionsQuery = useModelVersions();
  const currentDraftQuery = useCurrentDraft();
  const publishMutation = usePublishModelVersion();
  const rollbackMutation = useRollbackModelVersion();

  const [publishFormOpen, setPublishFormOpen] = useState(false);
  const [rollbackTarget, setRollbackTarget] = useState<ModelVersion | null>(null);
  const [compareFromId, setCompareFromId] = useState('');
  const [compareToId, setCompareToId] = useState('');

  const allVersions = versionsQuery.data?.items ?? [];
  const currentDraft = currentDraftQuery.data;
  const userCanManageReleases = canManageReleases();

  const sortedVersions = [...allVersions].sort(
    (a, b) =>
      new Date(b.publishedAt ?? b.createdAt).getTime() -
      new Date(a.publishedAt ?? a.createdAt).getTime(),
  );

  const publishedVersions = sortedVersions.filter(
    (v) => v.state === ModelVersionStateEnum.PUBLISHED,
  );
  const latestPublished = publishedVersions[0] ?? null;

  // Default diff: latest published → current draft
  const effectiveFromId = compareFromId || latestPublished?.id || '';
  const effectiveToId = compareToId || currentDraft?.id || '';

  const diffQuery = useVersionDiff(effectiveFromId || undefined, effectiveToId || undefined);

  // Dedicated publication-status diff: always latestPublished → currentDraft,
  // independent of the comparison dropdowns so the banner is never misleading.
  const publicationDiffQuery = useVersionDiff(
    latestPublished?.id || undefined,
    currentDraft?.id || undefined,
  );

  const versionsForSelect = [
    ...sortedVersions,
    ...(currentDraft && !sortedVersions.find((v) => v.id === currentDraft.id)
      ? [currentDraft]
      : []),
  ];

  const pendingChangeTotal = publicationDiffQuery.data
    ? publicationDiffQuery.data.summary.addedCount +
      publicationDiffQuery.data.summary.modifiedCount +
      publicationDiffQuery.data.summary.removedCount
    : null;

  function handlePublishSubmit(label: string, description: string, notes: string, approvedBy: string) {
    publishMutation.mutate(
      {
        versionLabel: label,
        description: description || undefined,
        notes: notes || undefined,
        approvedBy: approvedBy || undefined,
      },
      {
        onSuccess: () => {
          setPublishFormOpen(false);
        },
      },
    );
  }

  function handleRollbackConfirm(notes: string) {
    if (!rollbackTarget) return;
    rollbackMutation.mutate(
      { rollbackOfVersionId: rollbackTarget.id, notes },
      {
        onSuccess: () => {
          setRollbackTarget(null);
        },
      },
    );
  }

  if (versionsQuery.isLoading || currentDraftQuery.isLoading) {
    return <ReleaseDashboardLoadingState />;
  }

  if (versionsQuery.error || currentDraftQuery.error) {
    const err = versionsQuery.error ?? currentDraftQuery.error!;
    const retry = versionsQuery.error
      ? () => void versionsQuery.refetch()
      : () => void currentDraftQuery.refetch();
    return (
      <StateMessageCard
        title="Error loading releases"
        description={err.message}
        variant="error"
        role="alert"
        action={
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={retry}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        }
      />
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      {/* ── Page header ── */}
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <h2 className="sapphire-text sapphire-text--heading-lg">Releases</h2>
        <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
          Manage model version snapshots, publish releases, and review version history.
        </p>
      </div>

      {/* ── Publication context banner ── */}
      <div
        className="sapphire-row sapphire-row--gap-sm"
        style={{ alignItems: 'center' }}
        aria-label="Publication status"
      >
        {currentDraft ? (
          <>
            <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
              Draft pending
            </span>
            {pendingChangeTotal !== null && (
              <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                {pendingChangeTotal === 0
                  ? 'No capability changes since last publication'
                  : `${pendingChangeTotal} capability change(s) pending since ${
                      latestPublished?.versionLabel ?? 'last publication'
                    }`}
              </span>
            )}
          </>
        ) : (
          <>
            <span className="sapphire-badge sapphire-badge--sm sapphire-badge--positive">
              Published
            </span>
            <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
              Model is fully published — no pending draft
            </span>
          </>
        )}
      </div>

      {/* ── Current draft ── */}
      <section
        className="sapphire-card sapphire-stack sapphire-stack--gap-md"
        aria-labelledby="release-draft-heading"
      >
        <div
          className="sapphire-row sapphire-row--gap-md"
          style={{ justifyContent: 'space-between', alignItems: 'center' }}
        >
          <h3
            id="release-draft-heading"
            className="sapphire-text sapphire-text--heading-md"
          >
            Current draft
          </h3>

          {currentDraft && !publishFormOpen && userCanManageReleases && (
            <button
              type="button"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
              onClick={() => setPublishFormOpen(true)}
            >
              <span className="sapphire-button__content">Publish draft…</span>
            </button>
          )}
        </div>

        {!userCanManageReleases && currentDraft && (
          <div
            className="sapphire-card"
            style={{
              borderLeft: '3px solid var(--sapphire-semantic-color-state-neutral-surface-default)',
              padding: 'var(--sapphire-semantic-size-spacing-sm)',
              marginTop: 'var(--sapphire-semantic-size-spacing-sm)',
            }}
            role="note"
          >
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              {getPermissionDeniedMessage('publish releases')}
            </p>
          </div>
        )}

        {!currentDraft ? (
          <p
            className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
            aria-label="No active draft"
          >
            No active draft. A new draft will be created automatically when the next change is
            made.
          </p>
        ) : (
          <div className="sapphire-stack sapphire-stack--gap-sm">
            <div className="sapphire-row sapphire-row--gap-sm" style={{ alignItems: 'center' }}>
              <ReleaseStatusBadge state={currentDraft.state} />
              <span className="sapphire-text sapphire-text--body-md">
                <strong>{currentDraft.versionLabel}</strong>
              </span>
            </div>
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Created by <strong>{currentDraft.createdBy}</strong> on{' '}
              {formatDateTime(currentDraft.createdAt)}
            </p>
            {currentDraft.notes && (
              <p className="sapphire-text sapphire-text--body-sm">{currentDraft.notes}</p>
            )}
          </div>
        )}

        {publishFormOpen && (
          <PublishForm
            isPending={publishMutation.isPending}
            error={publishMutation.error}
            onSubmit={handlePublishSubmit}
            onCancel={() => setPublishFormOpen(false)}
          />
        )}
      </section>

      {/* ── Version comparison ── */}
      {(effectiveFromId || effectiveToId) && (
        <section
          className="sapphire-card sapphire-stack sapphire-stack--gap-md"
          aria-labelledby="release-diff-heading"
        >
          <h3 id="release-diff-heading" className="sapphire-text sapphire-text--heading-md">
            Version comparison
          </h3>

          <div
            className="sapphire-row sapphire-row--gap-md"
            style={{ alignItems: 'flex-end', flexWrap: 'wrap' }}
          >
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="diff-from-version">
                From version
              </label>
              <select
                id="diff-from-version"
                className="sapphire-text-field"
                value={compareFromId || effectiveFromId}
                onChange={(e) => setCompareFromId(e.target.value)}
                aria-label="Comparison from version"
              >
                <option value="">— select version —</option>
                {versionsForSelect.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionLabel} ({v.state})
                  </option>
                ))}
              </select>
            </div>

            <span
              className="sapphire-text sapphire-text--body-md sapphire-text--secondary"
              aria-hidden="true"
              style={{ paddingBottom: '0.2rem' }}
            >
              →
            </span>

            <div className="sapphire-stack sapphire-stack--gap-xs">
              <label className="sapphire-field-label" htmlFor="diff-to-version">
                To version
              </label>
              <select
                id="diff-to-version"
                className="sapphire-text-field"
                value={compareToId || effectiveToId}
                onChange={(e) => setCompareToId(e.target.value)}
                aria-label="Comparison to version"
              >
                <option value="">— select version —</option>
                {versionsForSelect.map((v) => (
                  <option key={v.id} value={v.id}>
                    {v.versionLabel} ({v.state})
                  </option>
                ))}
              </select>
            </div>
          </div>

          {diffQuery.isLoading && (
            <div
              role="status"
              aria-label="Loading version diff"
              className="sapphire-stack sapphire-stack--gap-sm"
            >
              <LoadingSkeleton height="1rem" />
              <LoadingSkeleton height="1rem" width="75%" />
            </div>
          )}

          {diffQuery.error && (
            <p
              role="alert"
              className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
            >
              Could not load diff: {diffQuery.error.message}
            </p>
          )}

          {diffQuery.data && (
            <DiffSummarySection
              diff={diffQuery.data}
              fromLabel={
                versionsForSelect.find((v) => v.id === (compareFromId || effectiveFromId))
                  ?.versionLabel ?? '…'
              }
              toLabel={
                versionsForSelect.find((v) => v.id === (compareToId || effectiveToId))
                  ?.versionLabel ?? '…'
              }
            />
          )}
        </section>
      )}

      {/* ── Version history ── */}
      <section
        className="sapphire-card sapphire-stack sapphire-stack--gap-md"
        aria-labelledby="release-history-heading"
      >
        <h3 id="release-history-heading" className="sapphire-text sapphire-text--heading-md">
          Version history
        </h3>

        {sortedVersions.length === 0 ? (
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            No published versions yet. Publish the current draft to create the first release.
          </p>
        ) : (
          <div role="list" aria-label="Version history">
            {sortedVersions.map((version) => (
              <div role="listitem" key={version.id}>
                <VersionHistoryRow
                  version={version}
                  onRollback={userCanManageReleases ? setRollbackTarget : undefined}
                />
              </div>
            ))}
          </div>
        )}
      </section>

      {/* ── Rollback dialog ── */}
      <RollbackConfirmDialog
        isOpen={rollbackTarget !== null}
        onClose={() => setRollbackTarget(null)}
        onConfirm={handleRollbackConfirm}
        targetVersionLabel={rollbackTarget?.versionLabel ?? ''}
        currentVersionLabel={latestPublished?.versionLabel ?? 'current version'}
        isPending={rollbackMutation.isPending}
      />

      {rollbackMutation.error && (
        <p
          role="alert"
          className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
          style={{ marginTop: 'var(--sapphire-semantic-size-spacing-sm)' }}
        >
          Rollback failed: {rollbackMutation.error.message}
        </p>
      )}
    </div>
  );
}
