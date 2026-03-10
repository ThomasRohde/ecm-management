import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { CapabilityType } from '@ecm/shared';
import {
  useCapabilityLeaves,
  useCapabilitySubtree,
  type CapabilityChildSummary,
  type CapabilitySummary,
  type CapabilitySubtreeNode,
} from '../api/capabilities';
import { LoadingSkeleton } from './ui/LoadingSkeleton';
import { StateMessageCard } from './ui/StateMessageCard';
import styles from './CapabilityHierarchyExplorer.module.css';

type ViewMode = 'children' | 'subtree' | 'leaves';

interface Props {
  id: string;
  /** Direct children already fetched via the capability detail endpoint. */
  directChildren: CapabilityChildSummary[];
}

// ---------------------------------------------------------------------------
// Recursive subtree renderer
// ---------------------------------------------------------------------------

/** Returns true if this node or any descendant matches the filter. */
function subtreeNodeMatchesFilter(node: CapabilitySubtreeNode, lower: string): boolean {
  if (node.uniqueName.toLowerCase().includes(lower)) return true;
  return node.children.some((child) => subtreeNodeMatchesFilter(child, lower));
}

function SubtreeList({ nodes, filter }: { nodes: CapabilitySubtreeNode[]; filter: string }) {
  const lower = filter.toLowerCase();
  // Keep a node if it matches OR if any descendant matches (ancestor-aware filter)
  const visible = filter
    ? nodes.filter((n) => subtreeNodeMatchesFilter(n, lower))
    : nodes;

  if (visible.length === 0) return null;

  return (
    <ul className={styles.treeList}>
      {visible.map((node) => (
        <li key={node.id} className={styles.treeItem}>
          <div className={styles.treeRow}>
            <span
              className={`sapphire-badge sapphire-badge--sm ${node.type === CapabilityType.LEAF ? 'sapphire-badge--positive' : 'sapphire-badge--accent'}`}
            >
              {node.type}
            </span>
            <Link
              to={`/capabilities/${node.id}`}
              className="sapphire-text sapphire-text--body-sm sapphire-text--accent"
              style={{ textDecoration: 'none' }}
            >
              {node.uniqueName}
            </Link>
          </div>
          {node.children.length > 0 && (
            <SubtreeList nodes={node.children} filter={filter} />
          )}
        </li>
      ))}
    </ul>
  );
}

// ---------------------------------------------------------------------------
// Flat list shared by "children" and "leaves" views
// ---------------------------------------------------------------------------
function FlatList({
  items,
  emptyTitle,
  emptyMessage,
}: {
  items: Array<{ id: string; uniqueName: string; type: CapabilityType; description?: string | null }>;
  emptyTitle: string;
  emptyMessage: string;
}) {
  if (items.length === 0) {
    return (
      <StateMessageCard title={emptyTitle} description={emptyMessage} />
    );
  }
  return (
    <ul style={{ paddingLeft: 0, margin: 0, listStyle: 'none' }}>
      {items.map((item) => (
        <li key={item.id} className={styles.listRow}>
          <span
            className={`sapphire-badge sapphire-badge--sm ${item.type === CapabilityType.LEAF ? 'sapphire-badge--positive' : 'sapphire-badge--accent'}`}
          >
            {item.type}
          </span>
          <Link
            to={`/capabilities/${item.id}`}
            className="sapphire-text sapphire-text--body-sm sapphire-text--accent"
            style={{ textDecoration: 'none' }}
          >
            {item.uniqueName}
          </Link>
          {item.description != null && item.description !== '' && (
            <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
              {item.description}
            </span>
          )}
        </li>
      ))}
    </ul>
  );
}

function HierarchyExplorerLoadingState() {
  return (
    <div
      className={styles.loadingState}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading hierarchy view"
    >
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        Loading hierarchy…
      </p>
      <div className={styles.loadingList}>
        {[0, 1, 2].map((index) => (
          <div key={index} className={styles.loadingRow}>
            <LoadingSkeleton width="4.5rem" height="0.75rem" radius="pill" />
            <div className={styles.loadingContent}>
              <LoadingSkeleton width={index === 1 ? '11rem' : '9rem'} height="0.9rem" />
              <LoadingSkeleton width="100%" height="0.75rem" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Main explorer component
// ---------------------------------------------------------------------------
export function CapabilityHierarchyExplorer({ id, directChildren }: Props) {
  const [viewMode, setViewMode] = useState<ViewMode>('children');
  const [filter, setFilter] = useState('');

  const {
    data: subtree,
    isLoading: subtreeLoading,
    error: subtreeError,
    refetch: refetchSubtree,
  } = useCapabilitySubtree(id);
  const {
    data: leaves,
    isLoading: leavesLoading,
    error: leavesError,
    refetch: refetchLeaves,
  } = useCapabilityLeaves(id);

  const lower = filter.toLowerCase();

  const filteredChildren = useMemo(
    () =>
      filter
        ? directChildren.filter((c) => c.uniqueName.toLowerCase().includes(lower))
        : directChildren,
    [directChildren, filter, lower],
  );

  const filteredLeaves = useMemo((): CapabilitySummary[] => {
    if (!leaves) return [];
    return filter ? leaves.filter((l) => l.uniqueName.toLowerCase().includes(lower)) : leaves;
  }, [leaves, filter, lower]);

  const isLoading =
    (viewMode === 'subtree' && subtreeLoading) || (viewMode === 'leaves' && leavesLoading);

  const activeError =
    (viewMode === 'subtree' && subtreeError) || (viewMode === 'leaves' && leavesError) || null;

  function retryActiveView() {
    if (viewMode === 'subtree') {
      void refetchSubtree();
      return;
    }

    if (viewMode === 'leaves') {
      void refetchLeaves();
    }
  }

  function viewButton(mode: ViewMode, label: string) {
    const active = viewMode === mode;
    return (
      <button
        type="button"
        className={`sapphire-button sapphire-button--sm ${active ? 'sapphire-button--primary' : 'sapphire-button--tertiary'}`}
        aria-pressed={active}
        onClick={() => setViewMode(mode)}
      >
        <span className="sapphire-button__content">{label}</span>
      </button>
    );
  }

  return (
    <div className={styles.explorer}>
      {/* Toolbar: view-mode toggles + local filter */}
      <div className={styles.toolbar}>
        <div role="group" aria-label="Hierarchy view mode" className={styles.viewToggle}>
          {viewButton('children', 'Direct children')}
          {viewButton('subtree', 'Full subtree')}
          {viewButton('leaves', 'Leaf capabilities')}
        </div>

        <div className={styles.filterBox}>
          <label
            htmlFor={`hierarchy-filter-${id}`}
            className="sapphire-text sapphire-text--caption-sm sapphire-text--secondary"
          >
            Filter
          </label>
          <input
            id={`hierarchy-filter-${id}`}
            type="search"
            className={`sapphire-text-field ${styles.filterInput}`}
            placeholder="Filter by name…"
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            aria-label="Filter capabilities by name"
          />
        </div>
      </div>

      {/* Content area — aria-live so screen readers hear updates */}
      <div aria-live="polite" aria-busy={isLoading}>
        {isLoading && <HierarchyExplorerLoadingState />}

        {!isLoading && activeError && (
          <StateMessageCard
            title="Error loading hierarchy"
            description={
              activeError instanceof Error
                ? activeError.message
                : 'Failed to load capabilities.'
            }
            variant="error"
            role="alert"
            action={(
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={retryActiveView}
              >
                <span className="sapphire-button__content">Retry</span>
              </button>
            )}
          />
        )}

        {!isLoading && !activeError && viewMode === 'children' && (
          <FlatList
            items={filteredChildren}
            emptyTitle={
              filter ? 'No matching child capabilities' : 'No child capabilities'
            }
            emptyMessage={filter ? 'No children match the filter.' : 'No child capabilities.'}
          />
        )}

        {!isLoading && !activeError && viewMode === 'subtree' && subtree && (
          subtree.children.length === 0 ? (
            <StateMessageCard
              title={filter ? 'No matching subtree capabilities' : 'No subtree entries'}
              description={
                filter ? 'No nodes match the filter.' : 'No child capabilities in subtree.'
              }
            />
          ) : (
            <SubtreeList nodes={subtree.children} filter={filter} />
          )
        )}

        {!isLoading && !activeError && viewMode === 'leaves' && (
          <FlatList
            items={filteredLeaves}
            emptyTitle={filter ? 'No matching leaf capabilities' : 'No leaf capabilities'}
            emptyMessage={
              filter ? 'No leaves match the filter.' : 'No leaf capabilities under this node.'
            }
          />
        )}
      </div>
    </div>
  );
}
