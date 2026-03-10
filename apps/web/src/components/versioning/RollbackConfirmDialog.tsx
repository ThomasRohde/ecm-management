import { useEffect, useState } from 'react';
import type { CapabilityVersion } from '@ecm/shared';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import { VersionDiffView } from './VersionDiffView';
import styles from './RollbackConfirmDialog.module.css';

export interface RollbackConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the notes entered by the user when the rollback is confirmed. */
  onConfirm: (notes: string) => void;
  /** Label of the version being restored (the rollback target). */
  targetVersionLabel: string;
  /** Label of the current version that will be superseded. */
  currentVersionLabel: string;
  /** Whether the confirm action is in progress. */
  isPending?: boolean;
  /**
   * Optional capability version entries to preview. When provided, a
   * collapsible diff section is shown before the notes field.
   */
  previewEntries?: CapabilityVersion[];
}

/**
 * Confirmation dialog for rolling back a model version.
 * Captures optional rationale notes and can preview affected capability diffs.
 */
export function RollbackConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  targetVersionLabel,
  currentVersionLabel,
  isPending = false,
  previewEntries,
}: RollbackConfirmDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);
  const [notes, setNotes] = useState('');
  const [notesError, setNotesError] = useState('');
  const [isDiffExpanded, setIsDiffExpanded] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setNotes('');
      setNotesError('');
      setIsDiffExpanded(false);
    }
  }, [isOpen]);

  function handleCancel(e: React.SyntheticEvent) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!notes.trim()) {
      setNotesError('Rollback rationale is required.');
      return;
    }
    setNotesError('');
    onConfirm(notes.trim());
  }

  const hasDiffPreview = previewEntries && previewEntries.length > 0;

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="rollback-dialog-title"
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="rollback-dialog-title" className="sapphire-text sapphire-text--heading-md">
          Confirm rollback
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

      <form onSubmit={handleSubmit} noValidate aria-busy={isPending || undefined}>
        <div className={styles.dialogBody}>
          <div className={styles.warningBox} role="note">
            <strong>This will roll back the model.</strong> Version{' '}
            <strong>{currentVersionLabel}</strong> will be superseded and the model will be
            restored to the state of version <strong>{targetVersionLabel}</strong>. This action
            cannot be undone.
          </div>

          {hasDiffPreview && (
            <div className={styles.diffPreviewSection}>
              <button
                type="button"
                className={styles.diffToggle}
                aria-expanded={isDiffExpanded}
                onClick={() => setIsDiffExpanded((v) => !v)}
              >
                <span>{isDiffExpanded ? '▲' : '▼'}</span>
                <span>
                  {isDiffExpanded ? 'Hide' : 'Show'} affected capabilities ({previewEntries.length})
                </span>
              </button>
              {isDiffExpanded && (
                <div className={styles.diffList}>
                  {previewEntries.map((entry) => (
                    <div key={entry.id} className={styles.diffEntry}>
                      <VersionDiffView
                        changeType={entry.changeType}
                        changedFields={entry.changedFields}
                        beforeSnapshot={entry.beforeSnapshot}
                        afterSnapshot={entry.afterSnapshot}
                        capabilityName={
                          typeof entry.afterSnapshot?.['uniqueName'] === 'string'
                            ? entry.afterSnapshot['uniqueName']
                            : typeof entry.beforeSnapshot?.['uniqueName'] === 'string'
                              ? entry.beforeSnapshot['uniqueName']
                              : undefined
                        }
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="rollback-notes">
              Rollback rationale <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="rollback-notes"
              className="sapphire-text-field"
              rows={3}
              placeholder="Explain why this rollback is necessary…"
              value={notes}
              data-autofocus
              onChange={(e) => {
                setNotes(e.target.value);
              }}
              disabled={isPending}
              required
              aria-describedby={notesError ? 'rollback-notes-error' : undefined}
              aria-invalid={notesError ? 'true' : undefined}
            />
            {notesError && (
              <p
                id="rollback-notes-error"
                role="alert"
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                {notesError}
              </p>
            )}
          </div>
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="submit"
            className="sapphire-button sapphire-button--danger sapphire-button--sm"
            disabled={isPending}
          >
            <span className="sapphire-button__content">
              {isPending ? 'Rolling back…' : 'Confirm rollback'}
            </span>
          </button>
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={onClose}
            disabled={isPending}
          >
            <span className="sapphire-button__content">Cancel</span>
          </button>
        </div>
      </form>
    </dialog>
  );
}
