import { Fragment, useState } from 'react';
import { CapabilityVersionChangeType } from '@ecm/shared';
import styles from './VersionDiffView.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

type DiffKind = 'added' | 'removed' | 'modified';

interface FieldDiff {
  field: string;
  label: string;
  before: unknown;
  after: unknown;
  kind: DiffKind;
}

export interface VersionDiffViewProps {
  changeType: CapabilityVersionChangeType;
  /** Keys are the changed field names. Used to identify which fields changed. */
  changedFields: Record<string, unknown>;
  /** Full capability snapshot immediately before this change (null for CREATE). */
  beforeSnapshot: Record<string, unknown> | null;
  /** Full capability snapshot immediately after this change (null for DELETE). */
  afterSnapshot: Record<string, unknown> | null;
  /** Optional capability name shown in the header. */
  capabilityName?: string;
  /**
   * Controls the visual layout of the diff.
   * - `structured` (default): table-style rows with before/after columns.
   * - `side-by-side`: two panels placed side by side.
   */
  viewMode?: 'structured' | 'side-by-side';
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatFieldLabel(field: string): string {
  return field
    .replace(/([A-Z])/g, ' $1')
    .replace(/^./, (c) => c.toUpperCase())
    .trim();
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value || '—';
  if (typeof value === 'boolean') return value ? 'Yes' : 'No';
  if (typeof value === 'number') return String(value);
  if (Array.isArray(value)) {
    if (value.length === 0) return '—';
    return (value as unknown[]).map((v) => String(v)).join(', ');
  }
  return JSON.stringify(value, null, 2);
}

function computeFieldDiffs(
  changeType: CapabilityVersionChangeType,
  changedFields: Record<string, unknown>,
  beforeSnapshot: Record<string, unknown> | null,
  afterSnapshot: Record<string, unknown> | null,
): FieldDiff[] {
  if (changeType === CapabilityVersionChangeType.CREATE) {
    const snapshot = afterSnapshot ?? {};
    return Object.entries(snapshot)
      .filter(([, val]) => val !== null && val !== undefined)
      .map(([field, val]) => ({
        field,
        label: formatFieldLabel(field),
        before: null,
        after: val,
        kind: 'added' as const,
      }));
  }

  if (changeType === CapabilityVersionChangeType.DELETE) {
    const snapshot = beforeSnapshot ?? {};
    return Object.entries(snapshot)
      .filter(([, val]) => val !== null && val !== undefined)
      .map(([field, val]) => ({
        field,
        label: formatFieldLabel(field),
        before: val,
        after: null,
        kind: 'removed' as const,
      }));
  }

  return Object.keys(changedFields).map((field) => {
    const before = beforeSnapshot?.[field] ?? null;
    const after = afterSnapshot?.[field] ?? null;
    let kind: DiffKind;
    if (before === null || before === undefined) {
      kind = 'added';
    } else if (after === null || after === undefined) {
      kind = 'removed';
    } else {
      kind = 'modified';
    }
    return { field, label: formatFieldLabel(field), before, after, kind };
  });
}

const changeTypeLabel: Record<CapabilityVersionChangeType, string> = {
  [CapabilityVersionChangeType.CREATE]: 'Created',
  [CapabilityVersionChangeType.UPDATE]: 'Updated',
  [CapabilityVersionChangeType.RENAME]: 'Renamed',
  [CapabilityVersionChangeType.REPARENT]: 'Re-parented',
  [CapabilityVersionChangeType.PROMOTE]: 'Promoted',
  [CapabilityVersionChangeType.DEMOTE]: 'Demoted',
  [CapabilityVersionChangeType.MERGE]: 'Merged',
  [CapabilityVersionChangeType.RETIRE]: 'Retired',
  [CapabilityVersionChangeType.DELETE]: 'Deleted',
};

const kindLabel: Record<DiffKind, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Modified',
};

// ─── Sub-components ───────────────────────────────────────────────────────────

interface ExpandableDetailProps {
  diff: FieldDiff;
  showBefore: boolean;
  showAfter: boolean;
}

function ExpandableDetail({ diff, showBefore, showAfter }: ExpandableDetailProps) {
  return (
    <div className={styles.expandedContent}>
      {showBefore && (
        <div className={styles.expandedPanel}>
          <div className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            Before
          </div>
          <pre className={styles.rawValue}>{JSON.stringify(diff.before, null, 2)}</pre>
        </div>
      )}
      {showAfter && (
        <div className={styles.expandedPanel}>
          <div className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
            After
          </div>
          <pre className={styles.rawValue}>{JSON.stringify(diff.after, null, 2)}</pre>
        </div>
      )}
    </div>
  );
}

interface DiffItemProps {
  diff: FieldDiff;
  isExpanded: boolean;
  showBefore: boolean;
  showAfter: boolean;
  onToggle: () => void;
}

function DiffItem({ diff, isExpanded, showBefore, showAfter, onToggle }: DiffItemProps) {
  return (
    <div className={`${styles.diffItem} ${styles[`diffItem--${diff.kind}`]}`}>
      <div className={styles.diffItemRow}>
        <span className={`${styles.kindIndicator} ${styles[`kindIndicator--${diff.kind}`]}`} />
        <span className={`sapphire-text sapphire-text--body-sm ${styles.fieldLabel}`}>
          {diff.label}
        </span>
        <div className={styles.diffValues}>
          {showBefore && (
            <span
              className={`sapphire-text sapphire-text--body-sm ${styles.valueCell} ${diff.kind === 'removed' ? styles.valueRemoved : ''}`}
            >
              {formatValue(diff.before)}
            </span>
          )}
          {showBefore && showAfter && (
            <span className={styles.arrow} aria-hidden="true">
              →
            </span>
          )}
          {showAfter && (
            <span
              className={`sapphire-text sapphire-text--body-sm ${styles.valueCell} ${diff.kind === 'added' ? styles.valueAdded : diff.kind === 'modified' ? styles.valueModified : ''}`}
            >
              {formatValue(diff.after)}
            </span>
          )}
        </div>
        <span className={`${styles.kindBadge} ${styles[`kindBadge--${diff.kind}`]}`}>
          {kindLabel[diff.kind]}
        </span>
        <button
          type="button"
          className={styles.expandButton}
          aria-expanded={isExpanded}
          aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${diff.label}`}
          onClick={onToggle}
        >
          {isExpanded ? '▲' : '▼'}
        </button>
      </div>
      {isExpanded && (
        <ExpandableDetail diff={diff} showBefore={showBefore} showAfter={showAfter} />
      )}
    </div>
  );
}

interface SideBySidePanelProps {
  diffs: FieldDiff[];
  side: 'before' | 'after';
  expandedFields: Set<string>;
  onToggleField: (field: string) => void;
}

function SideBySidePanel({ diffs, side, expandedFields, onToggleField }: SideBySidePanelProps) {
  const heading = side === 'before' ? 'Before' : 'After';
  return (
    <div className={styles.panel}>
      <div className={`sapphire-text sapphire-text--body-sm sapphire-text--secondary ${styles.panelHeading}`}>
        {heading}
      </div>
      {diffs.map((diff) => {
        const isExpanded = expandedFields.has(diff.field);
        const isChanged =
          (side === 'before' && diff.kind !== 'added') ||
          (side === 'after' && diff.kind !== 'removed');
        return (
          <Fragment key={diff.field}>
            <div
              className={`${styles.panelItem} ${isChanged ? styles[`panelItem--${diff.kind}`] : ''}`}
            >
              <span className={`sapphire-text sapphire-text--body-xs ${styles.panelFieldLabel}`}>
                {diff.label}
              </span>
              <span className={`sapphire-text sapphire-text--body-sm ${styles.panelValue}`}>
                {formatValue(side === 'before' ? diff.before : diff.after)}
              </span>
              {isChanged && (
                <button
                  type="button"
                  className={styles.expandButton}
                  aria-expanded={isExpanded}
                  aria-label={`${isExpanded ? 'Collapse' : 'Expand'} details for ${diff.label}`}
                  onClick={() => onToggleField(diff.field)}
                >
                  {isExpanded ? '▲' : '▼'}
                </button>
              )}
            </div>
            {isExpanded && isChanged && (
              <div className={styles.expandedContent}>
                <pre className={styles.rawValue}>
                  {JSON.stringify(side === 'before' ? diff.before : diff.after, null, 2)}
                </pre>
              </div>
            )}
          </Fragment>
        );
      })}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Displays a structured or side-by-side diff for a single capability change.
 * Accepts raw snapshot data and renders field-level additions, modifications,
 * and removals with expandable detail rows.
 */
export function VersionDiffView({
  changeType,
  changedFields,
  beforeSnapshot,
  afterSnapshot,
  capabilityName,
  viewMode = 'structured',
}: VersionDiffViewProps) {
  const [expandedFields, setExpandedFields] = useState<Set<string>>(new Set());

  const diffs = computeFieldDiffs(changeType, changedFields, beforeSnapshot, afterSnapshot);

  const showBefore = changeType !== CapabilityVersionChangeType.CREATE;
  const showAfter = changeType !== CapabilityVersionChangeType.DELETE;

  function toggleField(field: string) {
    setExpandedFields((prev) => {
      const next = new Set(prev);
      if (next.has(field)) {
        next.delete(field);
      } else {
        next.add(field);
      }
      return next;
    });
  }

  if (diffs.length === 0) {
    return (
      <div className={styles.container}>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No field changes to display.
        </p>
      </div>
    );
  }

  return (
    <div className={styles.container}>
      <div className={styles.header}>
        <span className="sapphire-badge sapphire-badge--accent">
          {changeTypeLabel[changeType]}
        </span>
        {capabilityName && (
          <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            {capabilityName}
          </span>
        )}
        <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
          {diffs.length} {diffs.length === 1 ? 'field' : 'fields'} changed
        </span>
      </div>

      {viewMode === 'side-by-side' ? (
        <div className={styles.sideBySide}>
          <SideBySidePanel
            diffs={diffs}
            side="before"
            expandedFields={expandedFields}
            onToggleField={toggleField}
          />
          <SideBySidePanel
            diffs={diffs}
            side="after"
            expandedFields={expandedFields}
            onToggleField={toggleField}
          />
        </div>
      ) : (
        <div className={styles.diffList}>
          {diffs.map((diff) => (
            <DiffItem
              key={diff.field}
              diff={diff}
              isExpanded={expandedFields.has(diff.field)}
              showBefore={showBefore}
              showAfter={showAfter}
              onToggle={() => toggleField(diff.field)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
