import { useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChangeRequestStatus, ChangeRequestType } from '@ecm/shared';
import {
  useChangeRequests,
  type ChangeRequestQueryParams,
} from '../api/change-requests';
import {
  ChangeRequestStatusBadge,
  ChangeRequestTypeBadge,
  changeRequestTypeLabel,
} from '../components/change-request/ChangeRequestBadges';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import styles from './ChangeRequestListPage.module.css';

const statusOptions = [
  { value: '', label: 'All statuses' },
  { value: ChangeRequestStatus.DRAFT, label: 'Draft' },
  { value: ChangeRequestStatus.SUBMITTED, label: 'Submitted' },
  { value: ChangeRequestStatus.PENDING_APPROVAL, label: 'Pending approval' },
  { value: ChangeRequestStatus.APPROVED, label: 'Approved' },
  { value: ChangeRequestStatus.EXECUTING, label: 'Executing' },
  { value: ChangeRequestStatus.COMPLETED, label: 'Completed' },
  { value: ChangeRequestStatus.REJECTED, label: 'Rejected' },
  { value: ChangeRequestStatus.CANCELLED, label: 'Cancelled' },
] as const;

const typeOptions = [
  { value: '', label: 'All types' },
  { value: ChangeRequestType.CREATE, label: changeRequestTypeLabel[ChangeRequestType.CREATE] },
  { value: ChangeRequestType.UPDATE, label: changeRequestTypeLabel[ChangeRequestType.UPDATE] },
  { value: ChangeRequestType.DELETE, label: changeRequestTypeLabel[ChangeRequestType.DELETE] },
  { value: ChangeRequestType.REPARENT, label: changeRequestTypeLabel[ChangeRequestType.REPARENT] },
  { value: ChangeRequestType.MERGE, label: changeRequestTypeLabel[ChangeRequestType.MERGE] },
  { value: ChangeRequestType.RETIRE, label: changeRequestTypeLabel[ChangeRequestType.RETIRE] },
] as const;

function parseStatus(value: string | null): ChangeRequestStatus | undefined {
  return value && Object.values(ChangeRequestStatus).includes(value as ChangeRequestStatus)
    ? (value as ChangeRequestStatus)
    : undefined;
}

function parseType(value: string | null): ChangeRequestType | undefined {
  return value && Object.values(ChangeRequestType).includes(value as ChangeRequestType)
    ? (value as ChangeRequestType)
    : undefined;
}

function formatDate(isoString: string): string {
  return new Date(isoString).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function ListLoadingState() {
  return (
    <div
      className={styles.loadingList}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading change requests"
    >
      {['18rem', '14rem', '16rem'].map((titleWidth) => (
        <div
          key={titleWidth}
          className={`sapphire-card sapphire-stack sapphire-stack--gap-sm ${styles.loadingCard}`}
        >
          <LoadingSkeleton width={titleWidth} height="1.1rem" />
          <LoadingSkeleton width="9rem" height="0.8rem" />
          <LoadingSkeleton width="60%" height="0.8rem" />
        </div>
      ))}
    </div>
  );
}

export function ChangeRequestListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const statusFilter = parseStatus(searchParams.get('status'));
  const typeFilter = parseType(searchParams.get('type'));
  const requestedByFilter = searchParams.get('requestedBy') ?? '';
  const [requestedByInput, setRequestedByInput] = useState(requestedByFilter);

  const queryParams: ChangeRequestQueryParams = {
    status: statusFilter,
    type: typeFilter,
    requestedBy: requestedByFilter || undefined,
  };

  const { data, isLoading, error, refetch } = useChangeRequests(queryParams);

  function setParam(key: string, value: string) {
    setSearchParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (value) {
          next.set(key, value);
        } else {
          next.delete(key);
        }
        return next;
      },
      { replace: true },
    );
  }

  function applyRequestedByFilter() {
    setParam('requestedBy', requestedByInput.trim());
  }

  const items = data?.items ?? [];
  const countLabel =
    data === undefined
      ? ''
      : items.length === 1
        ? '1 change request found'
        : `${items.length} change requests found`;

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <h2 className="sapphire-text sapphire-text--heading-lg">Change requests</h2>
        <Link
          to="/change-requests/create"
          className={`sapphire-button sapphire-button--primary ${styles.pageAction}`}
        >
          <span className="sapphire-button__content">New change request</span>
        </Link>
      </div>

      <div className={styles.filters}>
        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="cr-status-filter">
            Status
          </label>
          <select
            id="cr-status-filter"
            className="sapphire-text-field"
            value={statusFilter ?? ''}
            onChange={(e) => { setParam('status', e.target.value); }}
            disabled={isLoading}
          >
            {statusOptions.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="cr-type-filter">
            Type
          </label>
          <select
            id="cr-type-filter"
            className="sapphire-text-field"
            value={typeFilter ?? ''}
            onChange={(e) => { setParam('type', e.target.value); }}
            disabled={isLoading}
          >
            {typeOptions.map((opt) => (
              <option key={opt.label} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
          <label className="sapphire-field-label" htmlFor="cr-requestedby-filter">
            Requested by
          </label>
          <div className="sapphire-row sapphire-row--gap-xs" style={{ flexWrap: 'nowrap' }}>
            <input
              id="cr-requestedby-filter"
              type="text"
              className="sapphire-text-field"
              placeholder="User ID"
              value={requestedByInput}
              onChange={(e) => { setRequestedByInput(e.target.value); }}
              onKeyDown={(e) => {
                if (e.key === 'Enter') applyRequestedByFilter();
              }}
              disabled={isLoading}
            />
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={applyRequestedByFilter}
              disabled={isLoading}
              style={{ flexShrink: 0 }}
            >
              <span className="sapphire-button__content">Filter</span>
            </button>
          </div>
        </div>
      </div>

      {isLoading && <ListLoadingState />}

      {error && (
        <StateMessageCard
          title="Error loading change requests"
          description={error.message}
          variant="error"
          role="alert"
          action={(
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => { void refetch(); }}
            >
              <span className="sapphire-button__content">Retry</span>
            </button>
          )}
        />
      )}

      {!isLoading && !error && (
        <p
          className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
          aria-live="polite"
          aria-atomic="true"
        >
          {countLabel}
        </p>
      )}

      {!isLoading && !error && items.length > 0 && (
        <ul className={styles.list} aria-label="Change requests">
          {items.map((cr) => (
            <li key={cr.id}>
              <Link
                to={`/change-requests/${cr.id}`}
                className={`sapphire-card ${styles.listCard}`}
              >
                <div className={`sapphire-stack sapphire-stack--gap-xs`}>
                  <div className={styles.cardRow}>
                    <div className={styles.cardMeta}>
                      <ChangeRequestStatusBadge status={cr.status} size="sm" />
                      <ChangeRequestTypeBadge type={cr.type} size="sm" />
                    </div>
                    <span className={styles.cardMetaText}>
                      {formatDate(cr.createdAt)}
                    </span>
                  </div>

                  <p className="sapphire-text sapphire-text--body-md">
                    {cr.rationale ?? 'No rationale provided'}
                  </p>

                  <p className={styles.cardMetaText}>
                    Requested by {cr.requestedBy}
                    {' · '}
                    {cr.affectedCapabilityIds.length}{' '}
                    {cr.affectedCapabilityIds.length === 1
                      ? 'capability'
                      : 'capabilities'}{' '}
                    affected
                  </p>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {!isLoading && !error && items.length === 0 && (
        <StateMessageCard
          title={
            statusFilter || typeFilter || requestedByFilter
              ? 'No matching change requests'
              : 'No change requests yet'
          }
          description={
            statusFilter || typeFilter || requestedByFilter
              ? 'No change requests match the current filters.'
              : 'No change requests have been created. Submit one to start a governed structural change.'
          }
          action={
            statusFilter || typeFilter || requestedByFilter ? undefined : (
              <Link
                to="/change-requests/create"
                className="sapphire-button sapphire-button--primary sapphire-button--sm"
              >
                <span className="sapphire-button__content">New change request</span>
              </Link>
            )
          }
        />
      )}
    </div>
  );
}
