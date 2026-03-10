import { MappingStateBadge, MappingTypeBadge } from './MappingBadges';
import type { MappingDisplayDto } from './mapping.types';
import styles from './MappingTable.module.css';

export interface MappingTableProps {
  mappings: MappingDisplayDto[];
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
  onAdd?: () => void;
  onEdit?: (mapping: MappingDisplayDto) => void;
  onDelete?: (mapping: MappingDisplayDto) => void;
  emptyMessage?: string;
  capabilityName?: string;
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date);
}

export function MappingTable({
  mappings,
  isLoading = false,
  error = null,
  onRetry,
  onAdd,
  onEdit,
  onDelete,
  emptyMessage = 'No mappings have been added yet.',
  capabilityName,
}: MappingTableProps) {
  const isReadOnly = !onEdit && !onDelete;

  return (
    <section className="sapphire-stack sapphire-stack--gap-sm" aria-label="Capability mappings">
      <div className={styles.sectionHeader}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-md">
            {capabilityName ? `Mappings — ${capabilityName}` : 'Mappings'}
          </h2>
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            View system-to-capability mappings and manage their lifecycle state.
          </p>
        </div>

        {onAdd ? (
          <button
            type="button"
            className="sapphire-button sapphire-button--primary sapphire-button--sm"
            onClick={onAdd}
          >
            <span className="sapphire-button__content">Add mapping</span>
          </button>
        ) : null}
      </div>

      {isReadOnly && (
        <div
          className="sapphire-card"
          style={{
            borderLeft: '3px solid var(--sapphire-semantic-color-state-neutral-surface-default)',
            padding: 'var(--sapphire-semantic-size-spacing-sm)',
          }}
          role="note"
        >
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            You do not have permission to add, edit, or delete mappings. Contact an Integration Engineer for changes.
          </p>
        </div>
      )}

      {isLoading ? (
        <div className="sapphire-card sapphire-stack sapphire-stack--gap-sm">
          <span role="status" className="sapphire-text sapphire-text--body-sm">
            Loading…
          </span>
        </div>
      ) : null}

      {!isLoading && error ? (
        <div className="sapphire-card sapphire-stack sapphire-stack--gap-sm" role="alert">
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
            {error.message || 'Unable to load mappings.'}
          </p>
          {onRetry ? (
            <div>
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={onRetry}
              >
                <span className="sapphire-button__content">Retry</span>
              </button>
            </div>
          ) : null}
        </div>
      ) : null}

      {!isLoading && !error && mappings.length === 0 ? (
        <div className={`sapphire-card ${styles.emptyState}`}>
          <p className="sapphire-text sapphire-text--body-sm">{emptyMessage}</p>
        </div>
      ) : null}

      {!isLoading && !error && mappings.length > 0 ? (
        <div className={`sapphire-card ${styles.tableWrapper}`}>
          <table className={styles.table}>
            <thead>
              <tr>
                <th scope="col" className={styles.th}>
                  System
                </th>
                <th scope="col" className={styles.th}>
                  Type
                </th>
                <th scope="col" className={styles.th}>
                  State
                </th>
                <th scope="col" className={styles.th}>
                  Last updated
                </th>
                <th scope="col" className={styles.th}>
                  Actions
                </th>
              </tr>
            </thead>
            <tbody>
              {mappings.map((mapping) => (
                <tr key={mapping.id} className={styles.tr}>
                  <td className={styles.td}>
                    <div className="sapphire-stack sapphire-stack--gap-xs">
                      <span className="sapphire-text sapphire-text--body-sm">
                        {mapping.systemName}
                      </span>
                      <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                        {mapping.systemId}
                      </span>
                    </div>
                  </td>
                  <td className={styles.td}>
                    <MappingTypeBadge type={mapping.mappingType} size="sm" />
                  </td>
                  <td className={styles.td}>
                    <MappingStateBadge state={mapping.state} size="sm" />
                  </td>
                  <td className={styles.td}>{formatDate(mapping.updatedAt)}</td>
                  <td className={styles.td}>
                    <div className={styles.actionsCell}>
                      {onEdit ? (
                        <button
                          type="button"
                          className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                          aria-label={`Edit ${mapping.systemName}`}
                          onClick={() => onEdit(mapping)}
                        >
                          <span className="sapphire-button__content">Edit</span>
                        </button>
                      ) : null}
                      {onDelete ? (
                        <button
                          type="button"
                          className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                          aria-label={`Delete ${mapping.systemName}`}
                          onClick={() => onDelete(mapping)}
                        >
                          <span className="sapphire-button__content">Delete</span>
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : null}
    </section>
  );
}
