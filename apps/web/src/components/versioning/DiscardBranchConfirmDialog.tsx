import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import styles from './DiscardBranchConfirmDialog.module.css';

export interface DiscardBranchConfirmDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: () => void;
  /** Human-readable branch name shown in the confirmation text. */
  branchName: string;
  /** Whether the discard mutation is in progress. */
  isPending?: boolean;
  /** Server error message to surface if the discard mutation fails. */
  errorMessage?: string | null;
}

/**
 * Confirmation dialog for discarding (soft-deleting) a what-if branch.
 * Intentionally has no text-input requirement — discard is lower-stakes than rollback.
 */
export function DiscardBranchConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  branchName,
  isPending = false,
  errorMessage,
}: DiscardBranchConfirmDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);

  function handleCancel(e: React.SyntheticEvent) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="discard-branch-dialog-title"
      aria-modal="true"
      aria-busy={isPending || undefined}
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="discard-branch-dialog-title" className="sapphire-text sapphire-text--heading-md">
          Discard branch
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

      <div className={styles.dialogBody}>
        <div className={styles.warningBox} role="note">
          <strong>
            Branch <em>{branchName}</em> will be discarded.
          </strong>{' '}
          This removes the branch and its isolated changes. The main model is not affected. This
          action cannot be undone.
        </div>
        {errorMessage && (
          <p
            role="alert"
            className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
          >
            {errorMessage}
          </p>
        )}
      </div>

      <div className={styles.dialogFooter}>
        <button
          type="button"
          className="sapphire-button sapphire-button--danger sapphire-button--sm"
          disabled={isPending}
          onClick={onConfirm}
        >
          <span className="sapphire-button__content">
            {isPending ? 'Discarding…' : 'Discard branch'}
          </span>
        </button>
        <button
          type="button"
          className="sapphire-button sapphire-button--secondary sapphire-button--sm"
          onClick={onClose}
          disabled={isPending}
          data-autofocus
        >
          <span className="sapphire-button__content">Cancel</span>
        </button>
      </div>
    </dialog>
  );
}
