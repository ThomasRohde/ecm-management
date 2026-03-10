import { useEffect, useState } from 'react';
import { ChangeRequestType } from '@ecm/shared';
import { useCreateChangeRequest } from '../../api/change-requests';
import { getApiErrorMessages } from '../../api/client';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import styles from './StructuralOpDialog.module.css';

interface RetireDialogProps {
  capabilityId: string;
  capabilityName: string;
  isOpen: boolean;
  onClose: () => void;
  onSuccess: (changeRequestId: string) => void;
}

export function RetireDialog({
  capabilityId,
  capabilityName,
  isOpen,
  onClose,
  onSuccess,
}: RetireDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);
  const [rationale, setRationale] = useState('');
  const [effectiveTo, setEffectiveTo] = useState('');
  const [errors, setErrors] = useState<string[]>([]);

  const createChangeRequest = useCreateChangeRequest();

  useEffect(() => {
    if (isOpen) {
      setRationale('');
      setEffectiveTo('');
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

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const errs: string[] = [];
    if (!rationale.trim()) errs.push('Rationale is required.');
    if (errs.length > 0) {
      setErrors(errs);
      return;
    }
    setErrors([]);

    try {
      const created = await createChangeRequest.mutateAsync({
        type: ChangeRequestType.RETIRE,
        rationale: rationale.trim(),
        affectedCapabilityIds: [capabilityId],
        operationPayload: effectiveTo ? { effectiveTo } : {},
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
      aria-labelledby="retire-dialog-title"
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="retire-dialog-title" className="sapphire-text sapphire-text--heading-md">
          Retire capability
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
          <div className={styles.warningBox} role="note">
            You are requesting retirement of <strong>{capabilityName}</strong>.
            Active system mappings to this capability will be flagged for review once the change
            request is approved and executed.
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="retire-rationale">
              Rationale <span aria-hidden="true">*</span>
            </label>
            <textarea
              id="retire-rationale"
              className="sapphire-text-field"
              rows={3}
              placeholder="Explain why this capability should be retired…"
              value={rationale}
              data-autofocus
              onChange={(e) => {
                setRationale(e.target.value);
              }}
              disabled={isPending}
              required
            />
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="retire-effective-to">
              Effective date <span className="sapphire-text--secondary">(optional)</span>
            </label>
            <input
              id="retire-effective-to"
              type="date"
              className="sapphire-text-field"
              value={effectiveTo}
              onChange={(e) => {
                setEffectiveTo(e.target.value);
              }}
              disabled={isPending}
              aria-label="Effective date"
            />
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              If not set, the execution date will be used as the effective date.
            </p>
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
            disabled={isPending}
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
