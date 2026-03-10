import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BranchType, CapabilityVersionChangeType } from '@ecm/shared';
import type { ModelVersion } from '@ecm/shared';
import {
  useWhatIfBranches,
  useWhatIfBranchDiff,
  useCreateWhatIfBranch,
  useDiscardWhatIfBranch,
} from '../api/versioning';
import type { CreateWhatIfBranchInput, VersionDiffEntry } from '../api/versioning';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { CreateWhatIfBranchDialog } from '../components/versioning/CreateWhatIfBranchDialog';
import { DiscardBranchConfirmDialog } from '../components/versioning/DiscardBranchConfirmDialog';
import { VersionDiffView } from '../components/versioning/VersionDiffView';
import { canManageWhatIfBranches } from '../auth/permissions';
import styles from './WhatIfManagerPage.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function BranchListLoadingState() {
  return (
    <div
      className={styles.loadingList}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading what-if branches"
    >
      {['14rem', '18rem', '11rem'].map((w) => (
        <div
          key={w}
          className={`sapphire-card sapphire-stack sapphire-stack--gap-sm ${styles.loadingCard}`}
        >
          <LoadingSkeleton width={w} height="1rem" />
          <LoadingSkeleton width="9rem" height="0.75rem" />
          <LoadingSkeleton width="60%" height="0.75rem" />
        </div>
      ))}
    </div>
  );
}

interface BranchCardProps {
  branch: ModelVersion;
  isSelected: boolean;
  onSelect: () => void;
  onDiscard?: () => void;
}

function BranchCard({ branch, isSelected, onSelect, onDiscard }: BranchCardProps) {
  return (
    <li>
      <div
        className={`sapphire-card ${styles.branchCard} ${isSelected ? styles.branchCardSelected : ''}`}
        aria-current={isSelected ? 'true' : undefined}
      >
        <div className={styles.branchCardRow}>
          <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.branchCardBody}`}>
            <div className={styles.branchCardMeta}>
              <span className="sapphire-badge sapphire-badge--sm sapphire-badge--accent">
                {branch.branchName ?? branch.versionLabel}
              </span>
              <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                Analysis only
              </span>
            </div>
            {branch.description && (
              <p className="sapphire-text sapphire-text--body-sm">{branch.description}</p>
            )}
            <p className={styles.branchCardFootnote}>
              Created by <strong>{branch.createdBy}</strong> · {formatDate(branch.createdAt)}
              {branch.baseVersionId && (
                <> · forked from <code>{branch.baseVersionId.slice(0, 8)}</code></>
              )}
            </p>
          </div>

          <div className={styles.branchCardActions}>
            <button
              type="button"
              className={`sapphire-button sapphire-button--secondary sapphire-button--sm ${isSelected ? styles.actionButtonActive : ''}`}
              onClick={onSelect}
              aria-pressed={isSelected}
            >
              <span className="sapphire-button__content">
                {isSelected ? 'Hide diff' : 'View diff'}
              </span>
            </button>
            {onDiscard && (
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={onDiscard}
                aria-label={`Discard branch ${branch.branchName ?? branch.versionLabel}`}
              >
                <span className="sapphire-button__content">Discard</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </li>
  );
}

interface BranchDiffPanelProps {
  branchId: string;
  branchName: string;
}

function BranchDiffPanel({ branchId, branchName }: BranchDiffPanelProps) {
  const { data, isLoading, error } = useWhatIfBranchDiff(branchId);

  if (isLoading) {
    return (
      <div
        className={`sapphire-card ${styles.diffPanel}`}
        role="status"
        aria-label={`Loading diff for ${branchName}`}
      >
        <LoadingSkeleton height="1rem" width="12rem" />
        <LoadingSkeleton height="4rem" />
        <LoadingSkeleton height="4rem" />
      </div>
    );
  }

  if (error) {
    return (
      <div className={`sapphire-card ${styles.diffPanel}`}>
        <StateMessageCard
          title="Could not load diff"
          description={error.message}
          variant="error"
        />
      </div>
    );
  }

  if (!data) return null;

  const { added, modified, removed, summary } = data;

  const totalChanges = summary.addedCount + summary.modifiedCount + summary.removedCount;

  return (
    <section
      className={`sapphire-card ${styles.diffPanel}`}
      aria-label={`Diff for branch ${branchName}`}
    >
      <div className={styles.diffPanelHeader}>
        <h3 className="sapphire-text sapphire-text--heading-sm">
          Diff vs base
        </h3>
        <div className={styles.diffSummaryBadges}>
          {summary.addedCount > 0 && (
            <span className="sapphire-badge sapphire-badge--sm sapphire-badge--positive">
              +{summary.addedCount} added
            </span>
          )}
          {summary.modifiedCount > 0 && (
            <span className="sapphire-badge sapphire-badge--sm sapphire-badge--accent">
              ~{summary.modifiedCount} modified
            </span>
          )}
          {summary.removedCount > 0 && (
            <span className="sapphire-badge sapphire-badge--sm sapphire-badge--negative">
              −{summary.removedCount} removed
            </span>
          )}
          {totalChanges === 0 && (
            <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
              No changes
            </span>
          )}
        </div>
      </div>

      {totalChanges === 0 ? (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          This branch has no capability changes compared to its base version.
        </p>
      ) : (
        <DiffEntryList added={added} modified={modified} removed={removed} />
      )}
    </section>
  );
}

interface DiffEntryListProps {
  added: VersionDiffEntry[];
  modified: VersionDiffEntry[];
  removed: VersionDiffEntry[];
}

/**
 * Shows which fields changed for a modified capability.
 * The what-if diff response includes only the field *names* for modified entries
 * (no before/after snapshots), so we render a field name list rather than a
 * misleading null→null VersionDiffView.
 */
function ModifiedEntrySummary({ entry }: { entry: VersionDiffEntry }) {
  const fieldNames = Object.keys(entry.changedFields ?? {});
  const formatted = fieldNames.map((f) =>
    f.replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase()).trim(),
  );
  return (
    <div className={styles.modifiedEntry}>
      <div className={styles.modifiedEntryHeader}>
        <span className="sapphire-badge sapphire-badge--sm sapphire-badge--accent">Modified</span>
        <span className="sapphire-text sapphire-text--body-sm">{entry.name}</span>
      </div>
      {formatted.length > 0 ? (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Changed fields: {formatted.join(', ')}
        </p>
      ) : (
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Fields changed (details available in capability history).
        </p>
      )}
    </div>
  );
}

function DiffEntryList({ added, modified, removed }: DiffEntryListProps) {
  return (
    <div className={styles.diffEntryList}>
      {added.map((entry) => (
        <div key={entry.capabilityId} className={styles.diffEntry}>
          <VersionDiffView
            changeType={CapabilityVersionChangeType.CREATE}
            changedFields={{}}
            beforeSnapshot={null}
            afterSnapshot={entry.afterSnapshot as Record<string, unknown> | null ?? null}
            capabilityName={entry.name}
          />
        </div>
      ))}
      {modified.map((entry) => (
        <div key={entry.capabilityId} className={styles.diffEntry}>
          <ModifiedEntrySummary entry={entry} />
        </div>
      ))}
      {removed.map((entry) => (
        <div key={entry.capabilityId} className={styles.diffEntry}>
          <VersionDiffView
            changeType={CapabilityVersionChangeType.DELETE}
            changedFields={{}}
            beforeSnapshot={entry.beforeSnapshot as Record<string, unknown> | null ?? null}
            afterSnapshot={null}
            capabilityName={entry.name}
          />
        </div>
      ))}
    </div>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

/**
 * WhatIfManagerPage — what-if branch management surface.
 *
 * Lets users list, create, inspect (diff vs base), and discard what-if branches.
 * Branches are analysis-only: merge-back to the main model is deferred pending OQ-3.
 */
export function WhatIfManagerPage() {
  const { branchId: selectedBranchId } = useParams<{ branchId?: string }>();
  const navigate = useNavigate();

  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const [discardTarget, setDiscardTarget] = useState<ModelVersion | null>(null);
  const [createError, setCreateError] = useState<string | null>(null);
  const [discardError, setDiscardError] = useState<string | null>(null);

  const { data, isLoading, error, refetch } = useWhatIfBranches();
  const createMutation = useCreateWhatIfBranch();
  const discardMutation = useDiscardWhatIfBranch();

  const branches = data?.items ?? [];
  const selectedBranch = branches.find((b) => b.id === selectedBranchId) ?? null;
  const userCanManage = canManageWhatIfBranches();

  // ── Handlers ────────────────────────────────────────────────────────────────

  function handleCreateConfirm(input: CreateWhatIfBranchInput) {
    setCreateError(null);
    createMutation.mutate(input, {
      onSuccess: (created) => {
        setIsCreateOpen(false);
        void navigate(`/what-if/${created.id}`);
      },
      onError: (err) => {
        setCreateError(err.message ?? 'Failed to create branch. Please try again.');
      },
    });
  }

  function handleCreateClose() {
    if (!createMutation.isPending) {
      setIsCreateOpen(false);
      setCreateError(null);
    }
  }

  function handleSelectBranch(branch: ModelVersion) {
    if (selectedBranchId === branch.id) {
      void navigate('/what-if');
    } else {
      void navigate(`/what-if/${branch.id}`);
    }
  }

  function handleDiscardConfirm() {
    if (!discardTarget) return;
    setDiscardError(null);
    discardMutation.mutate(discardTarget.id, {
      onSuccess: () => {
        setDiscardTarget(null);
        setDiscardError(null);
        if (selectedBranchId === discardTarget.id) {
          void navigate('/what-if');
        }
      },
      onError: (err) => {
        setDiscardError(err.message ?? 'Failed to discard branch. Please try again.');
      },
    });
  }

  function handleDiscardClose() {
    if (!discardMutation.isPending) {
      setDiscardTarget(null);
      setDiscardError(null);
    }
  }

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      {/* Page header */}
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">What-if branches</h2>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            Create and explore speculative branches to model proposed capability changes before
            committing them to the main model.
          </p>
        </div>
        {userCanManage && (
          <button
            type="button"
            className="sapphire-button sapphire-button--primary"
            onClick={() => { setIsCreateOpen(true); }}
          >
            <span className="sapphire-button__content">New branch</span>
          </button>
        )}
      </div>

      {/* Analysis-only notice */}
      <div className={styles.analysisOnlyNotice} role="note" aria-label="Analysis-only notice">
        <strong>Analysis only.</strong> What-if branches are isolated from the main model.
        Exploring changes here does not affect published capability data. Merge-back to main is
        not yet available — it is deferred pending issue OQ-3.
      </div>

      {/* Branch list */}
      {isLoading && <BranchListLoadingState />}

      {error && !isLoading && (
        <StateMessageCard
          title="Error loading branches"
          description={error.message}
          variant="error"
          role="alert"
          action={
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => { void refetch(); }}
            >
              <span className="sapphire-button__content">Retry</span>
            </button>
          }
        />
      )}

      {!isLoading && !error && branches.length === 0 && (
        <StateMessageCard
          title="No what-if branches"
          description="Create a branch to start exploring capability changes in isolation."
          action={
            userCanManage ? (
              <button
                type="button"
                className="sapphire-button sapphire-button--primary sapphire-button--sm"
                onClick={() => { setIsCreateOpen(true); }}
              >
                <span className="sapphire-button__content">New branch</span>
              </button>
            ) : undefined
          }
        />
      )}

      {!isLoading && !error && branches.length > 0 && (
        <>
          <p
            className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
            aria-live="polite"
            aria-atomic="true"
          >
            {branches.length === 1 ? '1 active branch' : `${branches.length} active branches`}
          </p>

          <ul className={styles.branchList} aria-label="What-if branches">
            {branches
              .filter((b) => b.branchType === BranchType.WHAT_IF)
              .map((branch) => (
                <BranchCard
                  key={branch.id}
                  branch={branch}
                  isSelected={branch.id === selectedBranchId}
                  onSelect={() => { handleSelectBranch(branch); }}
                  onDiscard={userCanManage ? () => { setDiscardTarget(branch); } : undefined}
                />
              ))}
          </ul>

          {selectedBranch && (
            <BranchDiffPanel
              branchId={selectedBranch.id}
              branchName={selectedBranch.branchName ?? selectedBranch.versionLabel}
            />
          )}
        </>
      )}

      {/* Dialogs */}
      <CreateWhatIfBranchDialog
        isOpen={isCreateOpen}
        onClose={handleCreateClose}
        onConfirm={handleCreateConfirm}
        isPending={createMutation.isPending}
        errorMessage={createError}
      />

      {discardTarget && (
        <DiscardBranchConfirmDialog
          isOpen={discardTarget !== null}
          onClose={handleDiscardClose}
          onConfirm={handleDiscardConfirm}
          branchName={discardTarget.branchName ?? discardTarget.versionLabel}
          isPending={discardMutation.isPending}
          errorMessage={discardError}
        />
      )}
    </div>
  );
}
