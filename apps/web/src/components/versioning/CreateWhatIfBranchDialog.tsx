import { useEffect, useState } from 'react';
import type { CreateWhatIfBranchInput } from '../../api/versioning';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import styles from './CreateWhatIfBranchDialog.module.css';

export interface CreateWhatIfBranchDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** Called with the form values when the user confirms creation. */
  onConfirm: (input: CreateWhatIfBranchInput) => void;
  /** Whether the create mutation is in progress. */
  isPending?: boolean;
  /** Server error message to display inside the dialog (e.g. duplicate name). */
  errorMessage?: string | null;
}

/**
 * Modal dialog for creating a new what-if branch forked from the current
 * MAIN DRAFT.  Collects a required branch name and optional description.
 */
export function CreateWhatIfBranchDialog({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  errorMessage,
}: CreateWhatIfBranchDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);
  const [branchName, setBranchName] = useState('');
  const [description, setDescription] = useState('');
  const [nameError, setNameError] = useState('');

  // ── Reset form when dialog opens ───────────────────────────────────────────
  useEffect(() => {
    if (isOpen) {
      setBranchName('');
      setDescription('');
      setNameError('');
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
    const trimmed = branchName.trim();
    if (!trimmed) {
      setNameError('Branch name is required.');
      return;
    }
    if (!/^[a-z0-9][a-z0-9-]*$/.test(trimmed)) {
      setNameError(
        'Branch name must start with a lowercase letter or digit and contain only lowercase letters, digits, and hyphens.',
      );
      return;
    }
    setNameError('');
    onConfirm({ branchName: trimmed, description: description.trim() || undefined });
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="create-branch-dialog-title"
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="create-branch-dialog-title" className="sapphire-text sapphire-text--heading-md">
          New what-if branch
        </h3>
        <button
          type="button"
          className={styles.closeButton}
          aria-label="Close"
          onClick={onClose}
          disabled={isPending}
        >
          ×
        </button>
      </div>

      <form onSubmit={handleSubmit} noValidate aria-busy={isPending || undefined}>
        <div className={styles.dialogBody}>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            A new branch will be forked from the current main draft. Changes you explore in this
            branch remain isolated for analysis only — merge-back to main is not yet available.
          </p>

          {errorMessage && (
            <p
              role="alert"
              className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
            >
              {errorMessage}
            </p>
          )}

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="branch-name-input">
              Branch name <span aria-hidden="true">*</span>
            </label>
            <input
              id="branch-name-input"
              type="text"
              className="sapphire-text-field"
              placeholder="e.g. explore-ai-reskilling"
              value={branchName}
              data-autofocus
              onChange={(e) => {
                setBranchName(e.target.value);
              }}
              disabled={isPending}
              required
              aria-describedby={nameError ? 'branch-name-error' : 'branch-name-hint'}
              aria-invalid={nameError ? 'true' : undefined}
            />
            {nameError ? (
              <p
                id="branch-name-error"
                role="alert"
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                {nameError}
              </p>
            ) : (
              <p
                id="branch-name-hint"
                className="sapphire-text sapphire-text--body-xs sapphire-text--secondary"
              >
                Lowercase letters, digits, and hyphens only.
              </p>
            )}
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="branch-description-input">
              Description
            </label>
            <textarea
              id="branch-description-input"
              className="sapphire-text-field"
              rows={2}
              placeholder="What scenario does this branch explore?"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
              }}
              disabled={isPending}
            />
          </div>
        </div>

        <div className={styles.dialogFooter}>
          <button
            type="submit"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            disabled={isPending}
          >
            <span className="sapphire-button__content">
              {isPending ? 'Creating…' : 'Create branch'}
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
