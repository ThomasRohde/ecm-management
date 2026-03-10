import { useMemo } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { CapabilityType, LifecycleStatus } from '@ecm/shared';
import { useCapabilities } from '../api/capabilities';
import {
  buildActiveChangeRequestCountById,
  useChangeRequests,
} from '../api/change-requests';
import { ActiveChangeRequestsBadge } from '../components/change-request/ChangeRequestBadges';
import { CapabilitySearchBar } from '../components/capability/CapabilitySearchBar';
import { CapabilityTreeView } from '../components/capability/CapabilityTreeView';
import { LeafOnlyView } from '../components/capability/LeafOnlyView';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { canCreateCapability } from '../auth/permissions';
import styles from './CapabilityListPage.module.css';

type ViewMode = 'tree' | 'list' | 'leaves';
const capabilityBrowserLimit = 3000;

const capabilityTypeOptions = [
  { value: '', label: 'All types' },
  { value: CapabilityType.ABSTRACT, label: 'Abstract capabilities' },
  { value: CapabilityType.LEAF, label: 'Leaf capabilities' },
] as const;

const lifecycleStatusOptions = [
  { value: '', label: 'All lifecycle statuses' },
  { value: LifecycleStatus.DRAFT, label: 'Draft' },
  { value: LifecycleStatus.ACTIVE, label: 'Active' },
  { value: LifecycleStatus.DEPRECATED, label: 'Deprecated' },
  { value: LifecycleStatus.RETIRED, label: 'Retired' },
] as const;

function parseCapabilityType(value: string | null): CapabilityType | undefined {
  return value && Object.values(CapabilityType).includes(value as CapabilityType)
    ? (value as CapabilityType)
    : undefined;
}

function parseLifecycleStatus(value: string | null): LifecycleStatus | undefined {
  return value && Object.values(LifecycleStatus).includes(value as LifecycleStatus)
    ? (value as LifecycleStatus)
    : undefined;
}

function CapabilityListLoadingState({ viewMode }: { viewMode: ViewMode }) {
  return (
    <div
      className={styles.loadingState}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading capabilities"
    >
      <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
        Loading capabilities…
      </p>

      {viewMode === 'tree' ? (
        <div className={styles.loadingTree}>
          {[
            { depth: 0, titleWidth: '14rem' },
            { depth: 1, titleWidth: '11rem' },
            { depth: 2, titleWidth: '9rem' },
            { depth: 1, titleWidth: '10rem' },
            { depth: 0, titleWidth: '13rem' },
          ].map(({ depth, titleWidth }, index) => (
            <div
              key={`${depth}-${titleWidth}-${index}`}
              className={styles.loadingTreeRow}
              style={{
                paddingInlineStart: `calc(${depth} * var(--sapphire-semantic-size-spacing-md))`,
              }}
            >
              <LoadingSkeleton width="1.5rem" height="1.5rem" radius="pill" />
              <div className={styles.loadingTreeContent}>
                <LoadingSkeleton width={titleWidth} height="1rem" />
                <div className={styles.loadingTreeMeta}>
                  <LoadingSkeleton width="5rem" height="0.75rem" radius="pill" />
                  <LoadingSkeleton width="4rem" height="0.75rem" radius="pill" />
                </div>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.loadingCards}>
          {['18rem', '14rem', '16rem'].map((titleWidth) => (
            <div
              key={titleWidth}
              className={`sapphire-card sapphire-stack sapphire-stack--gap-sm ${styles.loadingCard}`}
            >
              <LoadingSkeleton width={titleWidth} height="1.25rem" />
              <LoadingSkeleton width="100%" height="0.9rem" />
              <LoadingSkeleton width="75%" height="0.9rem" />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export function CapabilityListPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchParam = searchParams.get('search') ?? '';
  const viewMode = (searchParams.get('view') as ViewMode | null) ?? 'tree';
  const typeFilter = parseCapabilityType(searchParams.get('type'));
  const lifecycleStatusFilter = parseLifecycleStatus(searchParams.get('lifecycleStatus'));
  const hasStructuredFilters = Boolean(typeFilter || lifecycleStatusFilter);
  const hierarchyQuery = useCapabilities({ limit: capabilityBrowserLimit });
  const filteredQuery = useCapabilities({
    search: searchParam || undefined,
    type: typeFilter,
    lifecycleStatus: lifecycleStatusFilter,
    limit: capabilityBrowserLimit,
  });

  const capabilities = filteredQuery.data?.items ?? [];
  const hierarchyCapabilities = hierarchyQuery.data?.items ?? [];
  const activeQuery =
    viewMode === 'tree' && !hasStructuredFilters ? hierarchyQuery : filteredQuery;
  const searchStatusQuery =
    viewMode === 'tree' && !hasStructuredFilters && !searchParam
      ? hierarchyQuery
      : filteredQuery;
  const shouldAnnounceSearchProgress = Boolean(
    searchParam || hasStructuredFilters || viewMode !== 'tree',
  );

  const capabilityCountLabel = useMemo(() => {
    const total =
      viewMode === 'tree'
        ? searchParam || hasStructuredFilters
          ? capabilities.length
          : hierarchyCapabilities.length
        : capabilities.length;

    return total === 1 ? '1 capability found' : `${total} capabilities found`;
  }, [capabilities.length, hasStructuredFilters, hierarchyCapabilities.length, searchParam, viewMode]);

  const changeRequestsQuery = useChangeRequests();
  const activeChangeRequestCountById = useMemo(
    () => buildActiveChangeRequestCountById(changeRequestsQuery.data?.items ?? []),
    [changeRequestsQuery.data],
  );

  function setSearchValue(nextSearchValue: string) {
    setSearchParams(
      (currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);

        if (nextSearchValue) {
          nextSearchParams.set('search', nextSearchValue);
        } else {
          nextSearchParams.delete('search');
        }

        return nextSearchParams;
      },
      { replace: true },
    );
  }

  function setViewMode(nextViewMode: ViewMode) {
    setSearchParams(
      (currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);

        if (nextViewMode === 'tree') {
          nextSearchParams.delete('view');
        } else {
          nextSearchParams.set('view', nextViewMode);
        }

        return nextSearchParams;
      },
      { replace: true },
    );
  }

  function setTypeFilter(nextTypeFilter: CapabilityType | '') {
    setSearchParams(
      (currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);

        if (nextTypeFilter) {
          nextSearchParams.set('type', nextTypeFilter);
        } else {
          nextSearchParams.delete('type');
        }

        return nextSearchParams;
      },
      { replace: true },
    );
  }

  function setLifecycleStatusFilter(nextLifecycleStatusFilter: LifecycleStatus | '') {
    setSearchParams(
      (currentSearchParams) => {
        const nextSearchParams = new URLSearchParams(currentSearchParams);

        if (nextLifecycleStatusFilter) {
          nextSearchParams.set('lifecycleStatus', nextLifecycleStatusFilter);
        } else {
          nextSearchParams.delete('lifecycleStatus');
        }

        return nextSearchParams;
      },
      { replace: true },
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <h2 className="sapphire-text sapphire-text--heading-lg">Capabilities</h2>
        {canCreateCapability() && (
          <Link
            to="/capabilities/create"
            className={`sapphire-button sapphire-button--primary ${styles.pageAction}`}
          >
            <span className="sapphire-button__content">New Capability</span>
          </Link>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.searchPanel}>
          <CapabilitySearchBar
            initialValue={searchParam}
            isDisabled={searchStatusQuery.isLoading}
            statusMessage={
              shouldAnnounceSearchProgress && searchStatusQuery.isFetching
                ? 'Searching capabilities…'
                : undefined
            }
            onSearchChange={setSearchValue}
          />

          <div className={styles.filterGrid}>
            <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
              <label className="sapphire-field-label" htmlFor="capability-type-filter">
                Capability type
              </label>
              <select
                id="capability-type-filter"
                className="sapphire-text-field"
                value={typeFilter ?? ''}
                onChange={(event) => {
                  setTypeFilter(event.target.value as CapabilityType | '');
                }}
                disabled={activeQuery.isLoading}
              >
                {capabilityTypeOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>

            <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.filterField}`}>
              <label className="sapphire-field-label" htmlFor="capability-status-filter">
                Lifecycle status
              </label>
              <select
                id="capability-status-filter"
                className="sapphire-text-field"
                value={lifecycleStatusFilter ?? ''}
                onChange={(event) => {
                  setLifecycleStatusFilter(event.target.value as LifecycleStatus | '');
                }}
                disabled={activeQuery.isLoading}
              >
                {lifecycleStatusOptions.map((option) => (
                  <option key={option.label} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>

        <div
          role="group"
          aria-label="Capability navigation view"
          className={styles.viewToggle}
        >
          {([
            ['tree', 'Tree view'],
            ['list', 'List view'],
            ['leaves', 'Leaf capabilities only'],
          ] as const).map(([mode, label]) => (
            <button
              key={mode}
              type="button"
              className={`sapphire-button sapphire-button--sm ${styles.viewToggleButton} ${viewMode === mode ? 'sapphire-button--primary' : 'sapphire-button--secondary'}`}
              aria-pressed={viewMode === mode}
              onClick={() => {
                setViewMode(mode);
              }}
            >
              <span className="sapphire-button__content">{label}</span>
            </button>
          ))}
        </div>
      </div>

      {activeQuery.isLoading && <CapabilityListLoadingState viewMode={viewMode} />}

      {activeQuery.error && (
        <StateMessageCard
          title="Error loading capabilities"
          description={activeQuery.error.message}
          variant="error"
          role="alert"
          action={(
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => {
                void activeQuery.refetch();
              }}
            >
              <span className="sapphire-button__content">Retry</span>
            </button>
          )}
        />
      )}

      {!activeQuery.isLoading && !activeQuery.error && (
        <p
          className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
          aria-live="polite"
          aria-atomic="true"
        >
          {capabilityCountLabel}
        </p>
      )}

      {!activeQuery.isLoading && !activeQuery.error && viewMode === 'tree' && (
        <CapabilityTreeView
          capabilities={hasStructuredFilters ? capabilities : hierarchyCapabilities}
          searchTerm={searchParam}
          hasActiveFilters={hasStructuredFilters}
          activeChangeRequestCountById={activeChangeRequestCountById}
        />
      )}

      {!activeQuery.isLoading && !activeQuery.error && viewMode === 'list' && (
        capabilities.length > 0 ? (
          <div className={styles.list}>
            {capabilities.map((capability) => {
              const crCount = activeChangeRequestCountById.get(capability.id) ?? 0;
              return (
                <Link
                  key={capability.id}
                  to={`/capabilities/${capability.id}`}
                  className={`sapphire-card ${styles.listCard}`}
                >
                  <div
                    className="sapphire-row sapphire-row--gap-sm"
                    style={{ justifyContent: 'space-between', flexWrap: 'wrap', alignItems: 'flex-start' }}
                  >
                    <h3 className="sapphire-text sapphire-text--heading-xs">
                      {capability.uniqueName}
                    </h3>
                    {crCount > 0 && (
                      <ActiveChangeRequestsBadge count={crCount} size="sm" />
                    )}
                  </div>
                  <p
                    className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
                    style={{ marginTop: 'var(--sapphire-semantic-size-spacing-3xs)' }}
                  >
                    {capability.description?.trim()
                      ? capability.description
                      : 'No description'}
                  </p>
                </Link>
              );
            })}
          </div>
        ) : (
          <StateMessageCard
            title={searchParam || hasStructuredFilters ? 'No matching capabilities' : 'No capabilities yet'}
            description={
              searchParam || hasStructuredFilters
                ? 'No capabilities match the current search or filters.'
                : 'No capabilities found. Create one to get started.'
            }
            action={
              searchParam || hasStructuredFilters || !canCreateCapability() ? undefined : (
                <Link
                  to="/capabilities/create"
                  className="sapphire-button sapphire-button--primary sapphire-button--sm"
                >
                  <span className="sapphire-button__content">Create capability</span>
                </Link>
              )
            }
          />
        )
      )}

      {!activeQuery.isLoading && !activeQuery.error && viewMode === 'leaves' && (
        <LeafOnlyView
          capabilities={capabilities}
          searchTerm={searchParam}
          hasActiveFilters={hasStructuredFilters}
          activeChangeRequestCountById={activeChangeRequestCountById}
        />
      )}
    </div>
  );
}
