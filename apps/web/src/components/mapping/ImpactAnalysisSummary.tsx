import type { ImpactAnalysisResult } from '@ecm/shared';
import { ImpactSeverity } from '@ecm/shared';
import styles from './ImpactAnalysisSummary.module.css';

export interface ImpactAnalysisSummaryProps {
  analysis: ImpactAnalysisResult | null;
  /** Optional operation type label shown in the heading (e.g. "RETIRE"). */
  operationType?: string;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

const severityBadgeVariant: Record<ImpactSeverity, string> = {
  [ImpactSeverity.LOW]: 'positive',
  [ImpactSeverity.MEDIUM]: 'warning',
  [ImpactSeverity.HIGH]: 'negative',
};

export function ImpactAnalysisSummary({
  analysis,
  operationType,
  isLoading = false,
  error = null,
  onRetry,
}: ImpactAnalysisSummaryProps) {
  if (isLoading) {
    return (
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-sm">
        <span role="status" className="sapphire-text sapphire-text--body-sm">
          Loading…
        </span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-sm" role="alert">
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--negative">
          {error.message || 'Unable to load impact analysis.'}
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
    );
  }

  if (!analysis) {
    return (
      <div className="sapphire-card sapphire-stack sapphire-stack--gap-sm">
        <p className="sapphire-text sapphire-text--body-sm">No impact analysis available.</p>
      </div>
    );
  }

  const { summary } = analysis;
  const variant = severityBadgeVariant[summary.severity];
  const heading = operationType
    ? `Impact analysis — ${operationType}`
    : 'Impact analysis';

  return (
    <section className="sapphire-card sapphire-stack sapphire-stack--gap-sm">
      <div className="sapphire-stack sapphire-stack--gap-xs">
        <div className="sapphire-row sapphire-row--gap-sm" style={{ flexWrap: 'wrap', alignItems: 'center' }}>
          <h2 className="sapphire-text sapphire-text--heading-md">{heading}</h2>
          <span className={`sapphire-badge sapphire-badge--sm sapphire-badge--${variant}`}>
            {summary.severity}
          </span>
        </div>
        <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Review the estimated downstream effects on affected capabilities.
        </p>
      </div>

      <div className={styles.metricsRow}>
        <div className={styles.metricBox}>
          <div className={styles.metricValue}>{summary.totalMappings}</div>
          <div className={styles.metricLabel}>Total mappings</div>
        </div>
        <div className={styles.metricBox}>
          <div className={styles.metricValue}>{summary.activeMappings}</div>
          <div className={styles.metricLabel}>Active mappings</div>
        </div>
        <div className={styles.metricBox}>
          <div className={styles.metricValue}>{summary.affectedSystemCount}</div>
          <div className={styles.metricLabel}>Affected systems</div>
        </div>
      </div>
    </section>
  );
}
