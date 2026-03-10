import { useDeferredValue, useEffect, useState } from 'react';
import { ChangeRequestType } from '@ecm/shared';
import { useCapabilities, type CapabilitySummary } from '../../api/capabilities';
import { useCreateChangeRequest } from '../../api/change-requests';
import { getApiErrorMessages } from '../../api/client';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import styles from './StructuralOpDialog.module.css';

interface MergeDialogProps {
  capabilityId: string;
  capabilityName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (changeRequestId: string) => void;
}

export function MergeDialog({
  capabilityId,
  capabilityName,
  isOpen,
  onClose,
  onSuccess,
}: MergeDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);
  const [search, setSearch] = useState('');
  const deferredSearch = useDeferredValue(search.trim());
  const [otherCapability, setOtherCapability] = useState<CapabilitySummary | null>(null);
  const [survivorChoice, setSurvivorChoice] = useState<'current' | 'other'>('current');
  const [rationale, setRationale] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const createChangeRequest = useCreateChangeRequest();

  const searchQuery = useCapabilities(
    { search: deferredSearch, limit: 10 },
    Boolean(deferredSearch),
  );
  const results = (searchQuery.data?.items ?? []).filter((c) => c.id !== capabilityId);

  useEffect(() => {
    if (isOpen) {
      setSearch('');
      setOtherCapability(null);
      setSurvivorChoice('current');
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

  function selectOther(cap: CapabilitySummary) {
    setOtherCapability(cap);
    setSearch('');
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!otherCapability) errs.push('Select another capability to merge with.');
    if (!rationale.trim()) errs.push('Rationale is required.');
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    try {
      const survivorCapabilityId = survivorChoice === 'current' ? capabilityId : otherCapability!.id;
      const created = await createChangeRequest.mutateAsync({
        type: ChangeRequestType.MERGE,
        rationale: rationale.trim(),
        affectedCapabilityIds: [capabilityId, otherCapability!.id],
        operationPayload: { survivorCapabilityId },
      });
      onSuccess(created.id);
    } catch (err) {
      setErrors(getApiErrorMessages(err, 'Failed to create change request.'));
    }
  }

  const isPending = createChangeRequest.isPending;
  const survivorName = survivorChoice === 'current' ? capabilityName : (otherCapability?.uniqueName ?? '');
  const absorbedName = survivorChoice === 'current' ? (otherCapability?.uniqueName ?? '') : capabilityName;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="merge-dialog-title"
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="merge-dialog-title" className="sapphire-text sapphire-text--heading-md">
          Merge capability
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
            Merging: <strong>{capabilityName}</strong>
          </p>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <span className="sapphire-field-label">
              Other capability <span aria-hidden="true">*</span>
            </span>

            {otherCapability ? (
              <div className={styles.selectedSingle}>
                <span className={styles.selectedSingleName}>{otherCapability.uniqueName}</span>
                <button
                  type="button"
                  className={styles.clearButton}
                  aria-label={`Remove ${otherCapability.uniqueName}`}
                  onClick={() => {
                    setOtherCapability(null);
                  }}
                >
                  ×
                </button>
              </div>
            ) : (
              <>
                <input
                  type="text"
                  className="sapphire-text-field"
                  placeholder="Search for the other capability to merge…"
                  value={search}
                  data-autofocus
                  onChange={(e) => {
                    setSearch(e.target.value);
                  }}
                  disabled={isPending}
                  aria-label="Search for capability to merge"
                />
                {searchQuery.isLoading && (
                  <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    Loading…
                  </span>
                )}
                {deferredSearch && results.length > 0 && (
                  <ul className={styles.pickerResults} aria-label="Capability search results">
                    {results.map((cap) => (
                      <li
                        key={cap.id}
                        className={styles.pickerResult}
                        role="option"
                        aria-selected={false}
                        tabIndex={0}
                        onClick={() => {
                          selectOther(cap);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            selectOther(cap);
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
                {deferredSearch && !searchQuery.isLoading && results.length === 0 && (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    No matching capabilities found.
                  </p>
                )}
              </>
            )}
          </div>

          {otherCapability && (
            <div className="sapphire-stack sapphire-stack--gap-xs">
              <span className="sapphire-field-label">Who survives?</span>
              <div
                className="sapphire-stack sapphire-stack--gap-xs"
                role="radiogroup"
                aria-label="Surviving capability"
              >
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sapphire-semantic-size-spacing-xs)',
                    cursor: 'pointer',
                    fontSize: 'var(--sapphire-semantic-size-font-sm)',
                  }}
                >
                  <input
                    type="radio"
                    name="merge-survivor"
                    value="current"
                    checked={survivorChoice === 'current'}
                    onChange={() => {
                      setSurvivorChoice('current');
                    }}
                    disabled={isPending}
                    aria-label={capabilityName}
                  />
                  {capabilityName} (current)
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 'var(--sapphire-semantic-size-spacing-xs)',
                    cursor: 'pointer',
                    fontSize: 'var(--sapphire-semantic-size-font-sm)',
                  }}
                >
                  <input
                    type="radio"
                    name="merge-survivor"
                    value="other"
                    checked={survivorChoice === 'other'}
                    onChange={() => {
                      setSurvivorChoice('other');
                    }}
                    disabled={isPending}
                    aria-label={otherCapability.uniqueName}
                  />
                  {otherCapability.uniqueName}
                </label>
              </div>

              <div className={styles.survivorPreview}>
                <strong>{absorbedName}</strong> will be absorbed into <strong>{survivorName}</strong>.
                Metadata, aliases, and mappings will transfer to the survivor.
              </div>
            </div>
          )}

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="merge-rationale">
              Rationale <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="merge-rationale"
              className="sapphire-text-field"
              rows={3}
              placeholder="Explain why these capabilities should be merged…"
              value={rationale}
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
              style={{ margin: 0, paddingLeft: '1.25rem', fontSize: 'var(--sapphire-semantic-size-font-sm)' }}
            >
              {errors.map((msg) => <li key={msg}>{msg}</li>)}
            </ul>
          )}
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="submit"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            disabled={isPending || !otherCapability}
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
