import { useEffect, useMemo, useRef, useState } from 'react';
import type { KeyboardEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import type { CapabilitySummary } from '../../api/capabilities';
import { ActiveChangeRequestsBadge } from '../change-request/ChangeRequestBadges';
import { StateMessageCard } from '../ui/StateMessageCard';
import {
  CapabilityStatusBadge,
  CapabilityTypeBadge,
} from './CapabilityBadges';
import styles from './CapabilityTreeView.module.css';

interface CapabilityTreeViewProps {
  capabilities: CapabilitySummary[];
  searchTerm?: string;
  hasActiveFilters?: boolean;
  /** Maps capability ID to the count of active (in-flight) change requests. */
  activeChangeRequestCountById?: ReadonlyMap<string, number>;
}

interface TreeNode extends CapabilitySummary {
  children: TreeNode[];
}

interface VisibleTreeNode {
  depth: number;
  hasChildren: boolean;
  isExpanded: boolean;
  node: TreeNode;
  parentId: string | null;
}

function buildTree(capabilities: CapabilitySummary[]): TreeNode[] {
  const nodesById = new Map<string, TreeNode>();

  for (const capability of capabilities) {
    nodesById.set(capability.id, {
      ...capability,
      children: [],
    });
  }

  const roots: TreeNode[] = [];

  for (const node of nodesById.values()) {
    if (node.parentId && nodesById.has(node.parentId)) {
      nodesById.get(node.parentId)?.children.push(node);
      continue;
    }

    roots.push(node);
  }

  const sortNodes = (nodes: TreeNode[]) => {
    nodes.sort((left, right) => left.uniqueName.localeCompare(right.uniqueName));
    nodes.forEach((node) => sortNodes(node.children));
  };

  sortNodes(roots);

  return roots;
}

function filterTree(nodes: TreeNode[], searchTerm: string): TreeNode[] {
  const normalizedSearchTerm = searchTerm.trim().toLowerCase();

  if (!normalizedSearchTerm) {
    return nodes;
  }

  return nodes.flatMap((node) => {
    const filteredChildren = filterTree(node.children, normalizedSearchTerm);
    const matchesNode =
      node.uniqueName.toLowerCase().includes(normalizedSearchTerm) ||
      node.description?.toLowerCase().includes(normalizedSearchTerm);

    if (!matchesNode && filteredChildren.length === 0) {
      return [];
    }

    return [{ ...node, children: filteredChildren }];
  });
}

function collectExpandableIds(nodes: TreeNode[]): Set<string> {
  const ids = new Set<string>();

  for (const node of nodes) {
    if (node.children.length > 0) {
      ids.add(node.id);
      for (const childId of collectExpandableIds(node.children)) {
        ids.add(childId);
      }
    }
  }

  return ids;
}

function findAncestorIds(nodes: TreeNode[], targetId: string, trail: string[] = []): string[] | null {
  for (const node of nodes) {
    if (node.id === targetId) {
      return trail;
    }

    const childTrail = findAncestorIds(node.children, targetId, [...trail, node.id]);
    if (childTrail) {
      return childTrail;
    }
  }

  return null;
}

function flattenVisibleNodes(
  nodes: TreeNode[],
  expandedIds: Set<string>,
  depth = 1,
  parentId: string | null = null,
): VisibleTreeNode[] {
  return nodes.flatMap((node) => {
    const isExpanded = expandedIds.has(node.id);
    const item: VisibleTreeNode = {
      depth,
      hasChildren: node.children.length > 0,
      isExpanded,
      node,
      parentId,
    };

    if (!isExpanded || node.children.length === 0) {
      return [item];
    }

    return [
      item,
      ...flattenVisibleNodes(node.children, expandedIds, depth + 1, node.id),
    ];
  });
}

export function CapabilityTreeView({
  capabilities,
  searchTerm = '',
  hasActiveFilters = false,
  activeChangeRequestCountById,
}: CapabilityTreeViewProps) {
  const navigate = useNavigate();
  const location = useLocation();
  const itemRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const rootNodes = useMemo(() => buildTree(capabilities), [capabilities]);
  const filteredNodes = useMemo(
    () => filterTree(rootNodes, searchTerm),
    [rootNodes, searchTerm],
  );
  const defaultExpandedIds = useMemo(
    () => new Set(rootNodes.map((node) => node.id)),
    [rootNodes],
  );
  const [expandedIds, setExpandedIds] = useState<Set<string>>(defaultExpandedIds);
  const visibleNodes = useMemo(
    () => flattenVisibleNodes(filteredNodes, expandedIds),
    [expandedIds, filteredNodes],
  );
  const [focusedId, setFocusedId] = useState<string | null>(null);
  const selectedCapabilityId = useMemo(() => {
    const detailMatch = location.pathname.match(/^\/capabilities\/([^/]+)$/i);
    if (!detailMatch || detailMatch[1] === 'create') {
      return null;
    }
    return detailMatch[1];
  }, [location.pathname]);

  useEffect(() => {
    if (searchTerm.trim()) {
      setExpandedIds(collectExpandableIds(filteredNodes));
      return;
    }

    setExpandedIds((currentExpandedIds) => {
      const nextExpandedIds = new Set<string>();

      for (const id of currentExpandedIds) {
        if (capabilities.some((capability) => capability.id === id)) {
          nextExpandedIds.add(id);
        }
      }

      if (nextExpandedIds.size === 0) {
        return new Set(defaultExpandedIds);
      }

      return nextExpandedIds;
    });
  }, [capabilities, defaultExpandedIds, filteredNodes, searchTerm]);

  useEffect(() => {
    if (!selectedCapabilityId || searchTerm.trim()) {
      return;
    }

    const ancestorIds = findAncestorIds(rootNodes, selectedCapabilityId);
    if (!ancestorIds || ancestorIds.length === 0) {
      return;
    }

    setExpandedIds((currentExpandedIds) => {
      const nextExpandedIds = new Set(currentExpandedIds);
      let hasChanged = false;

      for (const ancestorId of ancestorIds) {
        if (!nextExpandedIds.has(ancestorId)) {
          nextExpandedIds.add(ancestorId);
          hasChanged = true;
        }
      }

      return hasChanged ? nextExpandedIds : currentExpandedIds;
    });
  }, [rootNodes, searchTerm, selectedCapabilityId]);

  useEffect(() => {
    if (visibleNodes.length === 0) {
      setFocusedId(null);
      return;
    }

    setFocusedId((currentFocusedId) => {
      if (
        currentFocusedId &&
        visibleNodes.some((visibleNode) => visibleNode.node.id === currentFocusedId)
      ) {
        return currentFocusedId;
      }

      const firstVisibleNode = visibleNodes[0];
      return firstVisibleNode ? firstVisibleNode.node.id : null;
    });
  }, [visibleNodes]);

  useEffect(() => {
    if (!focusedId) {
      return;
    }

    itemRefs.current[focusedId]?.focus();
  }, [focusedId]);

  function setExpandedState(id: string, isExpanded: boolean) {
    setExpandedIds((currentExpandedIds) => {
      const nextExpandedIds = new Set(currentExpandedIds);

      if (isExpanded) {
        nextExpandedIds.add(id);
      } else {
        nextExpandedIds.delete(id);
      }

      return nextExpandedIds;
    });
  }

  function handleKeyDown(
    event: KeyboardEvent<HTMLDivElement>,
    visibleNode: VisibleTreeNode,
  ) {
    const currentIndex = visibleNodes.findIndex(
      (node) => node.node.id === visibleNode.node.id,
    );

    if (currentIndex === -1) {
      return;
    }

    switch (event.key) {
      case 'ArrowDown': {
        event.preventDefault();
        const nextNode = visibleNodes[currentIndex + 1];
        if (nextNode) {
          setFocusedId(nextNode.node.id);
        }
        break;
      }
      case 'ArrowUp': {
        event.preventDefault();
        const previousNode = visibleNodes[currentIndex - 1];
        if (previousNode) {
          setFocusedId(previousNode.node.id);
        }
        break;
      }
      case 'ArrowRight': {
        event.preventDefault();
        if (visibleNode.hasChildren && !visibleNode.isExpanded) {
          setExpandedState(visibleNode.node.id, true);
          break;
        }

        const nextNode = visibleNodes[currentIndex + 1];
        if (nextNode?.parentId === visibleNode.node.id) {
          setFocusedId(nextNode.node.id);
        }
        break;
      }
      case 'ArrowLeft': {
        event.preventDefault();
        if (visibleNode.hasChildren && visibleNode.isExpanded) {
          setExpandedState(visibleNode.node.id, false);
          break;
        }

        if (visibleNode.parentId) {
          setFocusedId(visibleNode.parentId);
        }
        break;
      }
      case 'Home': {
        event.preventDefault();
        setFocusedId(visibleNodes[0]?.node.id ?? null);
        break;
      }
      case 'End': {
        event.preventDefault();
        setFocusedId(visibleNodes[visibleNodes.length - 1]?.node.id ?? null);
        break;
      }
      case 'Enter':
      case ' ': {
        event.preventDefault();
        void navigate(`/capabilities/${visibleNode.node.id}`);
        break;
      }
      default:
        break;
    }
  }

  if (filteredNodes.length === 0) {
    return (
      <StateMessageCard
        title={
          searchTerm.trim() || hasActiveFilters ? 'No matching capabilities' : 'No capabilities yet'
        }
        description={
          searchTerm.trim() || hasActiveFilters
            ? 'No capabilities match your filters.'
            : 'No capabilities found. Create one to get started.'
        }
      />
    );
  }

  return (
    <div
      role="tree"
      aria-label="Capability hierarchy"
      className={styles.tree}
    >
      {visibleNodes.map((visibleNode) => {
        const { node } = visibleNode;
        const indentation = `calc(${visibleNode.depth - 1} * var(--sapphire-semantic-size-spacing-md))`;

        return (
          <div
            key={node.id}
            ref={(element) => {
              itemRefs.current[node.id] = element;
            }}
            role="treeitem"
            aria-label={node.uniqueName}
            aria-level={visibleNode.depth}
            aria-expanded={visibleNode.hasChildren ? visibleNode.isExpanded : undefined}
            aria-selected={selectedCapabilityId === node.id}
            tabIndex={focusedId === node.id ? 0 : -1}
            className={styles.treeItem}
            style={{ paddingInlineStart: indentation }}
            onClick={() => {
              void navigate(`/capabilities/${node.id}`);
            }}
            onFocus={() => {
              setFocusedId(node.id);
            }}
            onKeyDown={(event) => {
              handleKeyDown(event, visibleNode);
            }}
          >
            {visibleNode.hasChildren ? (
              <button
                type="button"
                className={styles.toggleButton}
                aria-label={
                  visibleNode.isExpanded
                    ? `Collapse ${node.uniqueName}`
                    : `Expand ${node.uniqueName}`
                }
                onClick={(event) => {
                  event.stopPropagation();
                  setExpandedState(node.id, !visibleNode.isExpanded);
                }}
              >
                <span aria-hidden="true">{visibleNode.isExpanded ? '-' : '+'}</span>
              </button>
            ) : (
              <span className={styles.togglePlaceholder} aria-hidden="true" />
            )}

            <div className={styles.content}>
              <span className="sapphire-text sapphire-text--body-sm">
                {node.uniqueName}
              </span>
              <div className={styles.meta}>
                <CapabilityStatusBadge status={node.lifecycleStatus} size="sm" />
                <CapabilityTypeBadge type={node.type} size="sm" />
                <ActiveChangeRequestsBadge
                  count={activeChangeRequestCountById?.get(node.id) ?? 0}
                  size="sm"
                />
              </div>
              {node.description?.trim() ? (
                <span
                  className={`sapphire-text sapphire-text--body-xs sapphire-text--secondary ${styles.description}`}
                >
                  {node.description}
                </span>
              ) : null}
            </div>
          </div>
        );
      })}
    </div>
  );
}
