import { useDeferredValue, useEffect, useMemo, useState } from 'react';
import { ChangeRequestType } from '@ecm/shared';
import {
  useCapabilities,
  useCapabilitySubtree,
  type CapabilitySummary,
  type CapabilitySubtreeNode,
} from '../../api/capabilities';
import { useCreateChangeRequest } from '../../api/change-requests';
import { getApiErrorMessages } from '../../api/client';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import styles from './StructuralOpDialog.module.css';

interface ReparentDialogProps {
  capabilityId: string;
  capabilityName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (changeRequestId: string) => void;
}

function collectDescendantIds(node: CapabilitySubtreeNode, ids: Set<string>): void {
  for (const child of node.children) {
    ids.add(child.id);
    collectDescendantIds(child, ids);
  }
}

export function ReparentDialog({
  capabilityId,
  capabilityName,
  isOpen,
  onClose,
  onSuccess,
}: ReparentDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [selectedParent, setSelectedParent] = useState<CapabilitySummary | null>(null);
  const [isRootLevel, setIsRootLevel] = useState(false);
  const [hasConfirmedParent, setHasConfirmedParent] = useState(false);
  const [rationale, setRationale] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const createChangeRequest = useCreateChangeRequest();
  const subtreeQuery = useCapabilitySubtree(capabilityId);

  const excludedIds = useMemo(() => {
    const ids = new Set<string>([capabilityId]);
    if (subtreeQuery.data) collectDescendantIds(subtreeQuery.data, ids);
    return ids;
  }, [capabilityId, subtreeQuery.data]);

  const searchQuery = useCapabilities(
    { search: deferredSearch, limit: 10 },
    Boolean(deferredSearch),
  );
  const results = (searchQuery.data?.items ?? []).filter((c) => !excludedIds.has(c.id));

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setSelectedParent(null);
      setIsRootLevel(false);
      setHasConfirmedParent(false);
      setRationale('');
      setErrors([]);
    }
  }, [isOpen]);

  function handleCancel(e: React.SyntheticEvent) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  function selectRootLevel() {
    setIsRootLevel(true);
    setSelectedParent(null);
    setHasConfirmedParent(true);
    setSearch('');
  }

  function selectParent(cap: CapabilitySummary) {
    setSelectedParent(cap);
    setIsRootLevel(false);
    setHasConfirmedParent(true);
    setSearch('');
  }

  function clearParentSelection() {
    setSelectedParent(null);
    setIsRootLevel(false);
    setHasConfirmedParent(false);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!hasConfirmedParent) errs.push('Select a new parent or choose "Move to root level".');
    if (!isRootLevel && (subtreeQuery.isLoading || !!subtreeQuery.error)) {
      errs.push('Wait for hierarchy validation before selecting a new parent.');
    }
    if (!rationale.trim()) errs.push('Rationale is required.');
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    try {
      const created = await createChangeRequest.mutateAsync({
        type: ChangeRequestType.REPARENT,
        rationale: rationale.trim(),
        affectedCapabilityIds: [capabilityId],
        operationPayload: { newParentId: isRootLevel ? null : (selectedParent?.id ?? null) },
      });
      onSuccess(created.id);
    } catch (err) {
      setErrors(getApiErrorMessages(err, 'Failed to create change request.'));
    }
  }

  const isPending = createChangeRequest.isPending;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="reparent-dialog-title"
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="reparent-dialog-title" className="sapphire-text sapphire-text--heading-md">
          Move capability
        </h3>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
        >
          ×
        </button>
      </div>

      <form
        onSubmit={(e) => {
          void handleSubmit(e);
        }}
        noValidate
        aria-busy={isPending || undefined}
      >
        <div className={styles.dialogBody}>
          <p className="sapphire-text sapphire-text--body-sm">
            Moving: <strong>{capabilityName}</strong>
          </p>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <span className="sapphire-field-label">
              New parent <span aria-hidden="true">*</span>
            </span>

            {hasConfirmedParent && isRootLevel && (
              <div className="sapphire-row sapphire-row--gap-xs" style={{ alignItems: 'center' }}>
                <span className="sapphire-badge sapphire-badge--neutral sapphire-badge--sm">
                  Root level (no parent)
                </span>
                <button
                  type="button"
                  className="sapphire-button sapphire-button--text"
                  style={{ fontSize: 'var(--sapphire-semantic-size-font-sm)' }}
                  onClick={clearParentSelection}
                >
                  Change
                </button>
              </div>
            )}

            {hasConfirmedParent && selectedParent && (
              <div className={styles.selectedSingle}>
                <span className={styles.selectedSingleName}>{selectedParent.uniqueName}</span>
                <button
                  type="button"
                  className={styles.clearButton}
                  aria-label={`Remove ${selectedParent.uniqueName}`}
                  onClick={clearParentSelection}
                >
                  ×
                </button>
              </div>
            )}

            {!hasConfirmedParent && (
              <>
                <button
                  type="button"
                  className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                  onClick={selectRootLevel}
                >
                  <span className="sapphire-button__content">Move to root level (no parent)</span>
                </button>
                <input
                  type="text"
                  className="sapphire-text-field"
                  placeholder="Or search for a new parent capability…"
                  value={search}
                  data-autofocus
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  disabled={isPending || subtreeQuery.isLoading || !!subtreeQuery.error}
                  aria-label="Search for new parent capability"
                />
                {subtreeQuery.isLoading && (
                  <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    Loading hierarchy guardrails…
                  </span>
                )}
                {subtreeQuery.error && (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    Unable to validate descendant exclusions right now. You can still move this
                    capability to root level.
                  </p>
                )}
                {searchQuery.isLoading && (
                  <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    Loading…
                  </span>
                )}
                {deferredSearch && !subtreeQuery.isLoading && !subtreeQuery.error && results.length > 0 && (
                  <ul className={styles.pickerResults} aria-label="Parent capability search results">
                    {results.map((cap) => (
                      <li
                        key={cap.id}
                        className={styles.pickerResult}
                        role="option"
                        aria-selected={false}
                        tabIndex={0}
                        onClick={() => {
                          selectParent(cap);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectParent(cap);
                          }
                        }}
                      >
                        <span>{cap.uniqueName}</span>
                        <span className="sapphire-badge sapphire-badge--sm sapphire-badge--neutral">
                          Select
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {deferredSearch
                  && !subtreeQuery.isLoading
                  && !subtreeQuery.error
                  && !searchQuery.isLoading
                  && results.length === 0 && (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    No matching capabilities found.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="reparent-rationale">
              Rationale <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="reparent-rationale"
              className="sapphire-text-field"
              rows={3}
              placeholder="Explain why this capability needs to be moved…"
              value={rationale}
              data-autofocus={hasConfirmedParent ? '' : undefined}
              onChange={(e) => {
                setRationale(e.target.value);
              }}
              disabled={isPending}
              required
            />
          </div>

          {errors.length > 0 && (
            <ul
              role="alert"
              style={{
                margin: 0,
                paddingLeft: '1.25rem',
                color: 'var(--sapphire-semantic-color-foreground-primary)',
                fontSize: 'var(--sapphire-semantic-size-font-sm)',
              }}
            >
              {errors.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          )}
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="submit"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            disabled={isPending || !hasConfirmedParent}
          >
            <span className="sapphire-button__content">
              {isPending ? 'Creating…' : 'Create change request'}
            </span>
          </button>
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={onClose}
          >
            <span className="sapphire-button__content">Cancel</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
