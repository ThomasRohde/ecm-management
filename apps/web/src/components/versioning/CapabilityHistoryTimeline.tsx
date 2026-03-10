import { Fragment, useState } from 'react';
import type { CapabilityVersion } from '@ecm/shared';
import { CapabilityVersionChangeType } from '@ecm/shared';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import { VersionDiffView } from './VersionDiffView';
import styles from './CapabilityHistoryTimeline.module.css';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CapabilityHistoryTimelineProps {
  entries: CapabilityVersion[];
  /** Optional name to display in the section heading. */
  capabilityName?: string;
  isLoading?: boolean;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

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

const changeTypeBadgeVariant: Record<CapabilityVersionChangeType, string> = {
  [CapabilityVersionChangeType.CREATE]: 'positive',
  [CapabilityVersionChangeType.UPDATE]: 'accent',
  [CapabilityVersionChangeType.RENAME]: 'accent',
  [CapabilityVersionChangeType.REPARENT]: 'accent',
  [CapabilityVersionChangeType.PROMOTE]: 'positive',
  [CapabilityVersionChangeType.DEMOTE]: 'warning',
  [CapabilityVersionChangeType.MERGE]: 'accent',
  [CapabilityVersionChangeType.RETIRE]: 'warning',
  [CapabilityVersionChangeType.DELETE]: 'negative',
};

function formatDateTime(isoString: string): string {
  try {
    return new Date(isoString).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return isoString;
  }
}

function summariseChangedFields(entry: CapabilityVersion): string {
  const keys = Object.keys(entry.changedFields);
  if (keys.length === 0) return '';
  if (keys.length <= 3) {
    return keys
      .map((k) =>
        k
          .replace(/([A-Z])/g, ' $1')
          .replace(/^./, (c) => c.toUpperCase())
          .trim(),
      )
      .join(', ');
  }
  return `${keys.length} fields changed`;
}

// ─── Timeline entry ───────────────────────────────────────────────────────────

interface TimelineEntryProps {
  entry: CapabilityVersion;
  isLast: boolean;
}

function TimelineEntry({ entry, isLast }: TimelineEntryProps) {
  const [isExpanded, setIsExpanded] = useState(false);
  const fieldSummary = summariseChangedFields(entry);

  return (
    <div className={styles.entry} data-testid="timeline-entry">
      <div className={styles.track}>
        <div
          className={`${styles.dot} ${styles[`dot--${changeTypeBadgeVariant[entry.changeType]}`]}`}
          aria-hidden="true"
        />
        {!isLast && <div className={styles.connector} aria-hidden="true" />}
      </div>

      <div className={styles.entryContent}>
        <div className={styles.entryHeader}>
          <span
            className={`sapphire-badge sapphire-badge--sm sapphire-badge--${changeTypeBadgeVariant[entry.changeType]}`}
          >
            {changeTypeLabel[entry.changeType]}
          </span>
          <time
            className="sapphire-text sapphire-text--body-xs sapphire-text--secondary"
            dateTime={entry.changedAt}
          >
            {formatDateTime(entry.changedAt)}
          </time>
        </div>

        <div className={styles.entrySummary}>
          <span className="sapphire-text sapphire-text--body-sm">
            By <strong>{entry.changedBy}</strong>
          </span>
          {fieldSummary && (
            <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              — {fieldSummary}
            </span>
          )}
        </div>

        <button
          type="button"
          className={styles.diffToggle}
          aria-expanded={isExpanded}
          onClick={() => setIsExpanded((v) => !v)}
        >
          {isExpanded ? '▲ Hide diff' : '▼ Show diff'}
        </button>

        {isExpanded && (
          <div className={styles.diffContainer}>
            <VersionDiffView
              changeType={entry.changeType}
              changedFields={entry.changedFields}
              beforeSnapshot={entry.beforeSnapshot}
              afterSnapshot={entry.afterSnapshot}
            />
          </div>
        )}
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

/**
 * Renders a chronological (newest-first) history timeline for a single capability.
 * Each entry shows the change type, author, timestamp, and an expandable diff view.
 */
export function CapabilityHistoryTimeline({
  entries,
  capabilityName,
  isLoading = false,
}: CapabilityHistoryTimelineProps) {
  if (isLoading) {
    return (
      <div
        className={styles.container}
        role="status"
        aria-label="Loading capability history"
      >
        <LoadingSkeleton height="2.5rem" radius="sm" />
        <LoadingSkeleton height="2.5rem" radius="sm" />
        <LoadingSkeleton height="2.5rem" radius="sm" />
      </div>
    );
  }

  if (entries.length === 0) {
    return (
      <div className={styles.container}>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No history recorded{capabilityName ? ` for ${capabilityName}` : ''}.
        </p>
      </div>
    );
  }

  const sorted = [...entries].sort(
    (a, b) => new Date(b.changedAt).getTime() - new Date(a.changedAt).getTime(),
  );

  return (
    <div className={styles.container} aria-label={capabilityName ? `History for ${capabilityName}` : 'Capability history'}>
      {sorted.map((entry, idx) => (
        <Fragment key={entry.id}>
          <TimelineEntry entry={entry} isLast={idx === sorted.length - 1} />
        </Fragment>
      ))}
    </div>
  );
}
