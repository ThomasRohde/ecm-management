import { useEffect, useState } from 'react';
import { MappingState } from '@ecm/shared';
import { useAccessibleDialog } from '../../hooks/useAccessibleDialog';
import type { MappingDisplayDto, MappingFormValues } from './mapping.types';
import styles from './MappingDialog.module.css';

export interface EditMappingDialogProps {
  isOpen: boolean;
  onClose: () => void;
  onConfirm: (values: MappingFormValues) => void;
  isPending?: boolean;
  errorMessage?: string | null;
  mapping: MappingDisplayDto;
}

export function EditMappingDialog({
  isOpen,
  onClose,
  onConfirm,
  isPending = false,
  errorMessage,
  mapping,
}: EditMappingDialogProps) {
  const dialogRef = useAccessibleDialog(isOpen);
  const [systemName, setSystemName] = useState(mapping.systemName);
  const [systemId, setSystemId] = useState(mapping.systemId);
  const [mappingType, setMappingType] = useState<string>(mapping.mappingType);
  const [state, setState] = useState<MappingState>(mapping.state);
  const [notes, setNotes] = useState((mapping.attributes?.['notes'] as string | undefined) ?? '');
  const [systemNameError, setSystemNameError] = useState('');
  const [systemIdError, setSystemIdError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSystemName(mapping.systemName);
      setSystemId(mapping.systemId);
      setMappingType(mapping.mappingType);
      setState(mapping.state);
      setNotes((mapping.attributes?.['notes'] as string | undefined) ?? '');
      setSystemNameError('');
      setSystemIdError('');
    }
  }, [isOpen, mapping]);

  function handleCancel(e: React.SyntheticEvent) {
    e.preventDefault();
    onClose();
  }

  function handleBackdropClick(e: React.MouseEvent<HTMLDialogElement>) {
    if (e.target === dialogRef.current) onClose();
  }

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();

    const trimmedSystemName = systemName.trim();
    const trimmedSystemId = systemId.trim();
    let hasError = false;

    if (!trimmedSystemName) {
      setSystemNameError('System name is required.');
      hasError = true;
    } else {
      setSystemNameError('');
    }

    if (!trimmedSystemId) {
      setSystemIdError('System ID is required.');
      hasError = true;
    } else {
      setSystemIdError('');
    }

    if (hasError) {
      return;
    }

    onConfirm({
      systemId: trimmedSystemId,
      systemName: trimmedSystemName,
      mappingType,
      state,
      notes: notes.trim(),
    });
  }

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby="edit-mapping-dialog-title"
      aria-modal="true"
      onCancel={handleCancel}
      onClick={handleBackdropClick}
    >
      <div className={styles.dialogHeader}>
        <h3 id="edit-mapping-dialog-title" className="sapphire-text sapphire-text--heading-md">
          Edit mapping
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
            Update the mapping for <strong>{mapping.capabilityName}</strong>.
          </p>

          {errorMessage ? (
            <p role="alert" className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
              {errorMessage}
            </p>
          ) : null}

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="edit-mapping-system-name">
              System name <span aria-hidden="true">*</span>
            </label>
            <input
              id="edit-mapping-system-name"
              aria-label="System name"
              type="text"
              className="sapphire-text-field"
              value={systemName}
              data-autofocus
              onChange={(e) => {
                setSystemName(e.target.value);
                if (systemNameError) {
                  setSystemNameError('');
                }
              }}
              disabled={isPending}
              required
              aria-invalid={systemNameError ? 'true' : undefined}
              aria-describedby={systemNameError ? 'edit-mapping-system-name-error' : undefined}
            />
            {systemNameError ? (
              <p
                id="edit-mapping-system-name-error"
                role="alert"
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                {systemNameError}
              </p>
            ) : null}
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="edit-mapping-system-id">
              System ID <span aria-hidden="true">*</span>
            </label>
            <input
              id="edit-mapping-system-id"
              aria-label="System ID"
              type="text"
              className="sapphire-text-field"
              value={systemId}
              onChange={(e) => {
                setSystemId(e.target.value);
                if (systemIdError) {
                  setSystemIdError('');
                }
              }}
              disabled={isPending}
              required
              aria-invalid={systemIdError ? 'true' : undefined}
              aria-describedby={systemIdError ? 'edit-mapping-system-id-error' : undefined}
            />
            {systemIdError ? (
              <p
                id="edit-mapping-system-id-error"
                role="alert"
                className="sapphire-text sapphire-text--body-sm sapphire-text--negative"
              >
                {systemIdError}
              </p>
            ) : null}
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="edit-mapping-type">
              Mapping type
            </label>
            <select
              id="edit-mapping-type"
              aria-label="Mapping type"
              className="sapphire-text-field"
              value={mappingType}
              onChange={(e) => {
                setMappingType(e.target.value);
              }}
              disabled={isPending}
              required
            >
              <option value="CONSUMES">CONSUMES</option>
              <option value="MANAGES">MANAGES</option>
              <option value="READS">READS</option>
              <option value="PRODUCES">PRODUCES</option>
            </select>
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="edit-mapping-state">
              State
            </label>
            <select
              id="edit-mapping-state"
              aria-label="State"
              className="sapphire-text-field"
              value={state}
              onChange={(e) => {
                setState(e.target.value as MappingState);
              }}
              disabled={isPending}
              required
            >
              <option value={MappingState.ACTIVE}>ACTIVE</option>
              <option value={MappingState.INACTIVE}>INACTIVE</option>
              <option value={MappingState.PENDING}>PENDING</option>
            </select>
          </div>

          <div className="sapphire-stack sapphire-stack--gap-xs">
            <label className="sapphire-field-label" htmlFor="edit-mapping-notes">
              Notes
            </label>
            <textarea
              id="edit-mapping-notes"
              aria-label="Notes"
              className="sapphire-text-field"
              rows={3}
              value={notes}
              onChange={(e) => {
                setNotes(e.target.value);
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
              {isPending ? 'Saving…' : 'Save changes'}
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
