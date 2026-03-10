import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEntry } from '@ecm/shared';
import { AuditAction, AuditEntityType, useAuditEntries } from '../api/audit';
import { canViewAudit, getPermissionDeniedMessage } from '../auth/permissions';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { useAuth } from '../contexts/AuthContext';
import styles from './AuditTrailPage.module.css';

const entityTypeOptions = [
  { value: '', label: 'All entity types' },
  { value: AuditEntityType.CAPABILITY, label: 'Capability' },
  { value: AuditEntityType.CHANGE_REQUEST, label: 'Change request' },
  { value: AuditEntityType.MODEL_VERSION, label: 'Model version' },
  { value: AuditEntityType.MAPPING, label: 'Mapping' },
  { value: AuditEntityType.DOWNSTREAM_CONSUMER, label: 'Downstream consumer' },
  { value: AuditEntityType.USER, label: 'User' },
  { value: AuditEntityType.AUTH_EVENT, label: 'Auth event' },
] as const;

const actionOptions = [
  { value: '', label: 'All actions' },
  { value: AuditAction.CREATE, label: 'Create' },
  { value: AuditAction.UPDATE, label: 'Update' },
  { value: AuditAction.DELETE, label: 'Delete' },
  { value: AuditAction.PUBLISH, label: 'Publish' },
  { value: AuditAction.ROLLBACK, label: 'Rollback' },
  { value: AuditAction.SUBMIT, label: 'Submit' },
  { value: AuditAction.APPROVE, label: 'Approve' },
  { value: AuditAction.REJECT, label: 'Reject' },
  { value: AuditAction.CANCEL, label: 'Cancel' },
  { value: AuditAction.LOCK, label: 'Lock' },
  { value: AuditAction.UNLOCK, label: 'Unlock' },
  { value: AuditAction.LOGIN, label: 'Login' },
  { value: AuditAction.LOGOUT, label: 'Logout' },
  { value: AuditAction.PERMISSION_CHANGE, label: 'Permission change' },
] as const;

function formatDateTime(value: string): string {
  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

function formatJson(value: Record<string, unknown> | null | undefined): string {
  return JSON.stringify(value, null, 2);
}

function AuditTrailLoadingState() {
  return (
    <div
      className={`sapphire-stack sapphire-stack--gap-md ${styles.list}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading audit trail"
    >
      {[0, 1, 2].map((index) => (
        <section key={index} className="sapphire-card sapphire-stack sapphire-stack--gap-sm">
          <LoadingSkeleton width="12rem" height="1.1rem" />
          <LoadingSkeleton width="9rem" height="0.9rem" />
          <LoadingSkeleton width="100%" height="0.9rem" />
          <LoadingSkeleton width="100%" height="4rem" />
        </section>
      ))}
    </div>
  );
}

function getEntityLink(entry: AuditEntry): { to: string; label: string } | null {
  switch (entry.entityType) {
    case AuditEntityType.CAPABILITY:
      return { to: `/capabilities/${entry.entityId}`, label: 'Open capability' };
    case AuditEntityType.CHANGE_REQUEST:
      return { to: `/change-requests/${entry.entityId}`, label: 'Open change request' };
    case AuditEntityType.MODEL_VERSION:
      return { to: '/releases', label: 'Open releases' };
    case AuditEntityType.MAPPING:
      return { to: '/mappings', label: 'Open mappings' };
    default:
      return null;
  }
}

export function AuditTrailPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();
  const [entityTypeFilter, setEntityTypeFilter] = useState<AuditEntityType | ''>('');
  const [actionFilter, setActionFilter] = useState<AuditAction | ''>('');
  const [actorIdInput, setActorIdInput] = useState('');
  const auditAllowed = canViewAudit();
  const auditQuery = useAuditEntries(
    auditAllowed
      ? {
          entityType: entityTypeFilter || undefined,
          action: actionFilter || undefined,
          actorId: actorIdInput.trim() || undefined,
          limit: 50,
          offset: 0,
        }
      : null,
    auditAllowed,
  );

  if (authLoading) {
    return <AuditTrailLoadingState />;
  }

  if (!isAuthenticated) {
    return (
      <StateMessageCard
        title="Sign in required"
        description={(
          <>
            You must sign in to view the audit trail. <Link to="/login">Go to the login page.</Link>
          </>
        )}
        role="status"
      />
    );
  }

  if (!auditAllowed) {
    return (
      <StateMessageCard
        title="Insufficient permissions"
        description={getPermissionDeniedMessage('view the audit trail')}
        variant="error"
        role="alert"
      />
    );
  }

  if (auditQuery.isLoading) {
    return <AuditTrailLoadingState />;
  }

  if (auditQuery.error) {
    return (
      <StateMessageCard
        title="Error loading audit trail"
        description={auditQuery.error.message}
        variant="error"
        role="alert"
        action={(
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => {
              void auditQuery.refetch();
            }}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        )}
      />
    );
  }

  const items = auditQuery.data?.items ?? [];
  const total = auditQuery.data?.total ?? 0;
  const totalLabel = total === 1 ? '1 audit entry' : `${total} audit entries`;

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">Audit trail</h2>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            Review immutable records of capability, change-request, release, mapping, and auth
            activity across the platform.
          </p>
        </div>

        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          {totalLabel}
        </p>
      </div>

      <div className={styles.filters}>
        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="audit-entity-filter">
            Entity type
          </label>
          <select
            id="audit-entity-filter"
            className="sapphire-text-field"
            value={entityTypeFilter}
            onChange={(event) => {
              setEntityTypeFilter(event.target.value as AuditEntityType | '');
            }}
          >
            {entityTypeOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="audit-action-filter">
            Action
          </label>
          <select
            id="audit-action-filter"
            className="sapphire-text-field"
            value={actionFilter}
            onChange={(event) => {
              setActionFilter(event.target.value as AuditAction | '');
            }}
          >
            {actionOptions.map((option) => (
              <option key={option.label} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="audit-actor-filter">
            Actor ID
          </label>
          <input
            id="audit-actor-filter"
            type="text"
            className="sapphire-text-field"
            placeholder="User ID or service actor"
            value={actorIdInput}
            onChange={(event) => {
              setActorIdInput(event.target.value);
            }}
          />
        </div>
      </div>

      {items.length === 0 ? (
        <StateMessageCard
          title="No audit entries"
          description="No audit entries match the current filters."
          role="status"
        />
      ) : (
        <ul className={styles.list} aria-label="Audit entries">
          {items.map((entry) => {
            const entityLink = getEntityLink(entry);

            return (
              <li key={entry.id}>
                <article className={`sapphire-card sapphire-stack sapphire-stack--gap-md ${styles.card}`}>
                  <div className={`sapphire-row ${styles.cardHeader}`}>
                    <div className="sapphire-stack sapphire-stack--gap-xs" style={{ flex: 1 }}>
                      <h3 className="sapphire-text sapphire-text--heading-xs">
                        {entry.entityType} {entry.action}
                      </h3>
                      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                        {formatDateTime(entry.timestamp)}
                      </p>
                    </div>

                    <div className={styles.badges}>
                      <span className="sapphire-badge sapphire-badge--neutral sapphire-badge--sm">
                        {entry.entityType}
                      </span>
                      <span className="sapphire-badge sapphire-badge--accent sapphire-badge--sm">
                        {entry.action}
                      </span>
                    </div>
                  </div>

                  <div className={styles.metaGrid}>
                    <div className="sapphire-stack sapphire-stack--gap-xs">
                      <span className="sapphire-text sapphire-text--caption-sm sapphire-text--secondary">
                        Actor
                      </span>
                      <span className="sapphire-text sapphire-text--body-sm">{entry.actorId}</span>
                    </div>
                    <div className="sapphire-stack sapphire-stack--gap-xs">
                      <span className="sapphire-text sapphire-text--caption-sm sapphire-text--secondary">
                        Entity ID
                      </span>
                      <span className="sapphire-text sapphire-text--body-sm">{entry.entityId}</span>
                    </div>
                  </div>

                  {entityLink ? (
                    <div>
                      <Link
                        to={entityLink.to}
                        className="sapphire-button sapphire-button--tertiary sapphire-button--sm"
                      >
                        <span className="sapphire-button__content">{entityLink.label}</span>
                      </Link>
                    </div>
                  ) : null}

                  {entry.before ? (
                    <details className={styles.details}>
                      <summary className="sapphire-text sapphire-text--body-sm">
                        Before snapshot
                      </summary>
                      <pre className={styles.jsonBlock}>{formatJson(entry.before)}</pre>
                    </details>
                  ) : null}

                  {entry.after ? (
                    <details className={styles.details}>
                      <summary className="sapphire-text sapphire-text--body-sm">
                        After snapshot
                      </summary>
                      <pre className={styles.jsonBlock}>{formatJson(entry.after)}</pre>
                    </details>
                  ) : null}

                  {entry.metadata ? (
                    <details className={styles.details}>
                      <summary className="sapphire-text sapphire-text--body-sm">
                        Metadata
                      </summary>
                      <pre className={styles.jsonBlock}>{formatJson(entry.metadata)}</pre>
                    </details>
                  ) : null}
                </article>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
