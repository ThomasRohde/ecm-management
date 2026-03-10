import { useState } from 'react';
import { Link } from 'react-router-dom';
import type { AuditEntityType } from '@ecm/shared';
import {
  useGapAnalysis,
  useModelHealth,
  useRecentActivity,
} from '../api/analytics';
import {
  downloadCapabilitiesCsv,
  downloadCurrentModelJson,
} from '../api/exports';
import { getApiErrorMessage } from '../api/client';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { useAuth } from '../contexts/AuthContext';
import styles from './AnalyticsDashboardPage.module.css';

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatPercent(value: number): string {
  return `${Math.round(value)}%`;
}

function formatDate(iso: string): string {
  try {
    return new Date(iso).toLocaleString(undefined, {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return iso;
  }
}

function entityTypeLabel(type: AuditEntityType): string {
  switch (type) {
    case 'CAPABILITY':
      return 'Capability';
    case 'MAPPING':
      return 'Mapping';
    case 'CHANGE_REQUEST':
      return 'Change request';
    case 'MODEL_VERSION':
      return 'Model version';
    case 'DOWNSTREAM_CONSUMER':
      return 'Downstream consumer';
    default:
      return String(type);
  }
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function DashboardLoadingState() {
  return (
    <div
      className="sapphire-stack sapphire-stack--gap-xl"
      role="status"
      aria-label="Loading analytics dashboard"
      aria-live="polite"
      aria-busy="true"
    >
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <LoadingSkeleton width="12rem" height="1.75rem" />
        <LoadingSkeleton width="20rem" height="1rem" />
      </div>
      <div className={styles.summaryGrid}>
        {[0, 1, 2].map((i) => (
          <div key={i} className="sapphire-card sapphire-stack sapphire-stack--gap-xs">
            <LoadingSkeleton width="8rem" height="1rem" />
            <LoadingSkeleton width="4rem" height="2rem" />
          </div>
        ))}
      </div>
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <LoadingSkeleton width="10rem" height="1.25rem" />
        <LoadingSkeleton width="100%" height="4rem" />
      </div>
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <LoadingSkeleton width="10rem" height="1.25rem" />
        {[0, 1, 2].map((i) => (
          <LoadingSkeleton key={i} width="100%" height="2.5rem" />
        ))}
      </div>
    </div>
  );
}

interface SummaryCardProps {
  label: string;
  value: string | number;
  subtext?: string;
  testId?: string;
}

function SummaryCard({ label, value, subtext, testId }: SummaryCardProps) {
  return (
    <div className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.summaryCard}`} data-testid={testId}>
      <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        {label}
      </span>
      <span className={`sapphire-text sapphire-text--heading-md ${styles.summaryValue}`}>
        {value}
      </span>
      {subtext ? (
        <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
          {subtext}
        </span>
      ) : null}
    </div>
  );
}

interface CoverageBarProps {
  covered: number;
  total: number;
  percentage: number;
  label: string;
}

function CoverageBar({ covered, total, percentage, label }: CoverageBarProps) {
  const pct = Math.min(100, Math.max(0, percentage));
  const variant =
    pct >= 80 ? styles.coverageBarFill__positive
    : pct >= 50 ? styles.coverageBarFill__warning
    : styles.coverageBarFill__negative;
  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <div className="sapphire-row" style={{ justifyContent: 'space-between', alignItems: 'center' }}>
        <span className="sapphire-text sapphire-text--body-sm">{label}</span>
        <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          {covered} / {total} ({formatPercent(pct)})
        </span>
      </div>
      <div className={styles.coverageBarTrack} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`${styles.coverageBarFill} ${variant}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

// ─── Export section ───────────────────────────────────────────────────────────

function ExportSection() {
  const [csvPending, setCsvPending] = useState(false);
  const [csvError, setCsvError] = useState<string | null>(null);
  const [jsonPending, setJsonPending] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  async function handleDownloadCsv() {
    setCsvPending(true);
    setCsvError(null);
    try {
      await downloadCapabilitiesCsv();
    } catch (err) {
      setCsvError(getApiErrorMessage(err, 'CSV export failed.'));
    } finally {
      setCsvPending(false);
    }
  }

  async function handleDownloadJson() {
    setJsonPending(true);
    setJsonError(null);
    try {
      await downloadCurrentModelJson();
    } catch (err) {
      setJsonError(getApiErrorMessage(err, 'JSON export failed.'));
    } finally {
      setJsonPending(false);
    }
  }

  return (
    <section aria-labelledby="exports-heading" className="sapphire-card sapphire-stack sapphire-stack--gap-md">
      <h3 id="exports-heading" className="sapphire-text sapphire-text--heading-xs">
        Export data
      </h3>
      <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        Download a snapshot of the capability model in your preferred format.
      </p>
      <div className={styles.exportActions}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            disabled={csvPending}
            aria-busy={csvPending}
            onClick={() => { void handleDownloadCsv(); }}
          >
            <span className="sapphire-button__content">
              {csvPending ? 'Exporting…' : 'Download CSV'}
            </span>
          </button>
          {csvError ? (
            <span className="sapphire-text sapphire-text--body-xs sapphire-text--negative">
              {csvError}
            </span>
          ) : null}
        </div>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            disabled={jsonPending}
            aria-busy={jsonPending}
            onClick={() => { void handleDownloadJson(); }}
          >
            <span className="sapphire-button__content">
              {jsonPending ? 'Exporting…' : 'Download JSON'}
            </span>
          </button>
          {jsonError ? (
            <span className="sapphire-text sapphire-text--body-xs sapphire-text--negative">
              {jsonError}
            </span>
          ) : null}
        </div>
      </div>
    </section>
  );
}

// ─── Page ──────────────────────────────────────────────────────────────────────

export function AnalyticsDashboardPage() {
  const { isAuthenticated, isLoading: authLoading } = useAuth();

  const healthQuery = useModelHealth(isAuthenticated);
  const gapQuery = useGapAnalysis({ limit: 20 }, isAuthenticated);
  const activityQuery = useRecentActivity(10, isAuthenticated);

  const isLoading =
    authLoading ||
    (isAuthenticated && (healthQuery.isLoading || gapQuery.isLoading || activityQuery.isLoading));

  // ── Not authenticated ────────────────────────────────────────────────────────
  if (!authLoading && !isAuthenticated) {
    return (
      <div className="sapphire-stack sapphire-stack--gap-xl" style={{ padding: 'var(--sapphire-semantic-size-spacing-xl)' }}>
        <StateMessageCard
          title="Sign in to view analytics"
          description="The analytics dashboard is only available to authenticated users. Please sign in to continue."
          action={(
            <Link
              to="/login"
              className="sapphire-button sapphire-button--primary sapphire-button--sm"
            >
              <span className="sapphire-button__content">Sign in</span>
            </Link>
          )}
          role="status"
        />
      </div>
    );
  }

  // ── Loading ──────────────────────────────────────────────────────────────────
  if (isLoading) {
    return (
      <div style={{ padding: 'var(--sapphire-semantic-size-spacing-xl)' }}>
        <DashboardLoadingState />
      </div>
    );
  }

  // ── Error: model health is the critical query ──────────────────────────────
  if (healthQuery.error) {
    return (
      <div style={{ padding: 'var(--sapphire-semantic-size-spacing-xl)' }}>
        <StateMessageCard
          title="Error loading dashboard"
          description={getApiErrorMessage(healthQuery.error, 'Failed to load analytics data.')}
          variant="error"
          role="alert"
          action={
            <button
              type="button"
              className="sapphire-button sapphire-button--secondary sapphire-button--sm"
              onClick={() => { void healthQuery.refetch(); }}
            >
              <span className="sapphire-button__content">Retry</span>
            </button>
          }
        />
      </div>
    );
  }

  const health = healthQuery.data?.data;
  const gap = gapQuery.data?.data;
  const activity = activityQuery.data?.data;
  const generatedAt = healthQuery.data?.meta.generatedAt;

  return (
    <div
      className={`sapphire-stack sapphire-stack--gap-xl ${styles.page}`}
    >
      {/* ── Page header ─────────────────────────────────────────────────────── */}
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">Analytics</h2>
          {generatedAt ? (
            <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
              Generated {formatDate(generatedAt)}
            </p>
          ) : null}
        </div>
      </div>

      {/* ── Summary cards ───────────────────────────────────────────────────── */}
      {health ? (
        <div className={styles.summaryGrid} aria-label="Model health summary">
          <SummaryCard
            label="Total capabilities"
            value={health.totalCapabilities.toLocaleString()}
            subtext={`${health.totalLeafCapabilities.toLocaleString()} leaf capabilities`}
            testId="summary-card-capabilities"
          />
          <SummaryCard
            label="Mapping coverage"
            value={formatPercent(health.mappingCoverage.percentage)}
            subtext={`${health.mappingCoverage.covered} of ${health.mappingCoverage.total} leaf capabilities mapped`}
            testId="summary-card-mapping"
          />
          <SummaryCard
            label="Stewardship coverage"
            value={formatPercent(health.stewardshipCoverage.percentage)}
            subtext={`${health.stewardshipCoverage.covered} of ${health.stewardshipCoverage.total} capabilities have a steward`}
            testId="summary-card-stewardship"
          />
          <SummaryCard
            label="Total mappings"
            value={health.totalMappings.toLocaleString()}
            testId="summary-card-mappings-total"
          />
        </div>
      ) : null}

      {/* ── Coverage by domain ──────────────────────────────────────────────── */}
      {health && health.domainBreakdown.length > 0 ? (
        <section
          aria-labelledby="coverage-heading"
          className="sapphire-card sapphire-stack sapphire-stack--gap-md"
        >
          <h3 id="coverage-heading" className="sapphire-text sapphire-text--heading-xs">
            Coverage by domain
          </h3>
          <div className="sapphire-stack sapphire-stack--gap-sm">
            {health.domainBreakdown.map((row) => {
              const domainLabel = row.domain ?? 'No domain';
              const mappingPct =
                row.leafCapabilityCount > 0
                  ? Math.round(
                      (row.mappedLeafCapabilityCount / row.leafCapabilityCount) * 100,
                    )
                  : 0;
              const stewardPct =
                row.capabilityCount > 0
                  ? Math.round(
                      (row.stewardshipCoverageCount / row.capabilityCount) * 100,
                    )
                  : 0;
              return (
                <div
                  key={row.domain ?? '__none__'}
                  className={styles.domainRow}
                >
                  <span
                    className={`sapphire-text sapphire-text--body-sm sapphire-text--secondary ${styles.domainLabel}`}
                  >
                    {domainLabel}
                  </span>
                  <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.domainBars}`}>
                    <CoverageBar
                      covered={row.mappedLeafCapabilityCount}
                      total={row.leafCapabilityCount}
                      percentage={mappingPct}
                      label={`Mapping – ${domainLabel}`}
                    />
                    <CoverageBar
                      covered={row.stewardshipCoverageCount}
                      total={row.capabilityCount}
                      percentage={stewardPct}
                      label={`Stewardship – ${domainLabel}`}
                    />
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      ) : null}

      {/* ── Gap analysis ────────────────────────────────────────────────────── */}
      <section
        aria-labelledby="gap-analysis-heading"
        className="sapphire-card sapphire-stack sapphire-stack--gap-md"
      >
        <h3 id="gap-analysis-heading" className="sapphire-text sapphire-text--heading-xs">
          Gap analysis
        </h3>

        {gapQuery.isLoading ? (
          <div role="status" aria-label="Loading gap analysis" aria-live="polite">
            <LoadingSkeleton width="100%" height="3rem" />
          </div>
        ) : gapQuery.error ? (
          <StateMessageCard
            title="Error loading gap analysis"
            description={getApiErrorMessage(gapQuery.error)}
            variant="error"
            role="alert"
            action={
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={() => { void gapQuery.refetch(); }}
              >
                <span className="sapphire-button__content">Retry</span>
              </button>
            }
          />
        ) : gap ? (
          <div className="sapphire-stack sapphire-stack--gap-md">
            {/* ── Unmapped active leaf capabilities ── */}
            <div className="sapphire-stack sapphire-stack--gap-sm">
              <div className="sapphire-row" style={{ alignItems: 'center', gap: 'var(--sapphire-semantic-size-spacing-sm)' }}>
                <h4 className="sapphire-text sapphire-text--body-md" style={{ margin: 0 }}>
                  Unmapped active leaf capabilities
                </h4>
                <span
                  className={`sapphire-badge sapphire-badge--sm ${gap.summary.unmappedActiveLeafCapabilityCount > 0 ? 'sapphire-badge--warning' : 'sapphire-badge--positive'}`}
                >
                  {gap.summary.unmappedActiveLeafCapabilityCount}
                </span>
              </div>
              {gap.unmappedActiveLeafCapabilities.length === 0 ? (
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  No unmapped active leaf capabilities – all leaf capabilities are mapped.
                </p>
              ) : (
                <ul className={styles.gapList} aria-label="Unmapped active leaf capabilities">
                  {gap.unmappedActiveLeafCapabilities.map((cap) => (
                    <li key={cap.id} className={styles.gapItem}>
                      <span className="sapphire-text sapphire-text--body-sm">{cap.uniqueName}</span>
                      {cap.domain ? (
                        <span className="sapphire-badge sapphire-badge--xs sapphire-badge--neutral">
                          {cap.domain}
                        </span>
                      ) : null}
                      {cap.stewardId ? (
                        <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                          Steward: {cap.stewardId}
                        </span>
                      ) : (
                        <span className="sapphire-badge sapphire-badge--xs sapphire-badge--warning">
                          No steward
                        </span>
                      )}
                    </li>
                  ))}
                </ul>
              )}
            </div>

            {/* ── Deprecated with active mappings ── */}
            <div className="sapphire-stack sapphire-stack--gap-sm">
              <div className="sapphire-row" style={{ alignItems: 'center', gap: 'var(--sapphire-semantic-size-spacing-sm)' }}>
                <h4 className="sapphire-text sapphire-text--body-md" style={{ margin: 0 }}>
                  Deprecated capabilities with active mappings
                </h4>
                <span
                  className={`sapphire-badge sapphire-badge--sm ${gap.summary.deprecatedCapabilitiesWithActiveMappingsCount > 0 ? 'sapphire-badge--negative' : 'sapphire-badge--positive'}`}
                >
                  {gap.summary.deprecatedCapabilitiesWithActiveMappingsCount}
                </span>
              </div>
              {gap.deprecatedCapabilitiesWithActiveMappings.length === 0 ? (
                <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                  No deprecated capabilities with active mappings.
                </p>
              ) : (
                <ul className={styles.gapList} aria-label="Deprecated capabilities with active mappings">
                  {gap.deprecatedCapabilitiesWithActiveMappings.map((cap) => (
                    <li key={cap.id} className={styles.gapItem}>
                      <span className="sapphire-text sapphire-text--body-sm">{cap.uniqueName}</span>
                      <span className="sapphire-badge sapphire-badge--xs sapphire-badge--negative">
                        {cap.activeMappingCount} active {cap.activeMappingCount === 1 ? 'mapping' : 'mappings'}
                      </span>
                      {cap.systems.length > 0 ? (
                        <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                          Systems: {cap.systems.join(', ')}
                        </span>
                      ) : null}
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Recent activity ─────────────────────────────────────────────────── */}
      <section
        aria-labelledby="activity-heading"
        className="sapphire-card sapphire-stack sapphire-stack--gap-md"
      >
        <h3 id="activity-heading" className="sapphire-text sapphire-text--heading-xs">
          Recent activity
        </h3>

        {activityQuery.isLoading ? (
          <div role="status" aria-label="Loading recent activity" aria-live="polite">
            {[0, 1, 2].map((i) => (
              <LoadingSkeleton key={i} width="100%" height="2.5rem" />
            ))}
          </div>
        ) : activityQuery.error ? (
          <StateMessageCard
            title="Error loading recent activity"
            description={getApiErrorMessage(activityQuery.error)}
            variant="error"
            role="alert"
            action={
              <button
                type="button"
                className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                onClick={() => { void activityQuery.refetch(); }}
              >
                <span className="sapphire-button__content">Retry</span>
              </button>
            }
          />
        ) : activity && activity.items.length > 0 ? (
          <ol className={styles.activityList} aria-label="Recent activity">
            {activity.items.map((item) => (
              <li key={item.id} className={styles.activityItem}>
                <div className="sapphire-row" style={{ alignItems: 'flex-start', gap: 'var(--sapphire-semantic-size-spacing-sm)', justifyContent: 'space-between' }}>
                  <div className="sapphire-stack sapphire-stack--gap-xs">
                    <span className="sapphire-text sapphire-text--body-sm">{item.summary}</span>
                    <span className="sapphire-text sapphire-text--body-xs sapphire-text--secondary">
                      {entityTypeLabel(item.entityType)} · {item.actorId} · {formatDate(item.occurredAt)}
                    </span>
                  </div>
                  <span className="sapphire-badge sapphire-badge--xs sapphire-badge--neutral" style={{ flexShrink: 0 }}>
                    {item.action}
                  </span>
                </div>
              </li>
            ))}
          </ol>
        ) : (
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            No recent activity to display.
          </p>
        )}
      </section>

      {/* ── Exports ─────────────────────────────────────────────────────────── */}
      <ExportSection />
    </div>
  );
}
