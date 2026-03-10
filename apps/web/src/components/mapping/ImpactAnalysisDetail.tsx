import { MappingStateBadge, MappingTypeBadge } from './MappingBadges';
import type { ImpactAnalysisResult } from '@ecm/shared';
import styles from './ImpactAnalysisDetail.module.css';

export interface ImpactAnalysisDetailProps {
  analysis: ImpactAnalysisResult | null;
  isLoading?: boolean;
  error?: Error | null;
  onRetry?: () => void;
}

export function ImpactAnalysisDetail({
  analysis,
  isLoading = false,
  error = null,
  onRetry,
}: ImpactAnalysisDetailProps) {
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
          {error.message || 'Unable to load impact details.'}
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

  return (
    <div className="sapphire-stack sapphire-stack--gap-md">
      {/* Impacted mappings */}
      <section className={`sapphire-card ${styles.section}`}>
        <div className="sapphire-stack sapphire-stack--gap-sm">
          <h2 className="sapphire-text sapphire-text--heading-md">Impacted mappings</h2>

          {analysis.impactedMappings.length === 0 ? (
            <p className={`sapphire-text sapphire-text--body-sm ${styles.emptyState}`}>
              No mappings are directly impacted.
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>System</th>
                    <th scope="col" className={styles.th}>Capability</th>
                    <th scope="col" className={styles.th}>Mapping type</th>
                    <th scope="col" className={styles.th}>State</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.impactedMappings.map((entry) => (
                    <tr key={entry.id} className={styles.tr}>
                      <td className={styles.td}>{entry.systemId}</td>
                      <td className={styles.td}>{entry.capabilityId}</td>
                      <td className={styles.td}>
                        <MappingTypeBadge type={entry.mappingType} size="sm" />
                      </td>
                      <td className={styles.td}>
                        <MappingStateBadge state={entry.state as Parameters<typeof MappingStateBadge>[0]['state']} size="sm" />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>

      {/* Affected systems */}
      <section className={`sapphire-card ${styles.section}`}>
        <div className="sapphire-stack sapphire-stack--gap-sm">
          <h2 className="sapphire-text sapphire-text--heading-md">Affected systems</h2>

          {analysis.impactedSystems.length === 0 ? (
            <p className={`sapphire-text sapphire-text--body-sm ${styles.emptyState}`}>
              No downstream systems are affected.
            </p>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col" className={styles.th}>System</th>
                    <th scope="col" className={styles.th}>Total mappings</th>
                    <th scope="col" className={styles.th}>Active mappings</th>
                  </tr>
                </thead>
                <tbody>
                  {analysis.impactedSystems.map((system) => (
                    <tr key={system.systemId} className={styles.tr}>
                      <td className={styles.td}>{system.systemId}</td>
                      <td className={styles.td}>{system.mappingIds.length}</td>
                      <td className={styles.td}>{system.activeMappingCount}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
