import { Link } from 'react-router-dom';
import { CapabilityStatusBadge } from '../components/capability/CapabilityBadges';
import { LoadingSkeleton } from '../components/ui/LoadingSkeleton';
import { StateMessageCard } from '../components/ui/StateMessageCard';
import { useFlaggedCapabilities } from '../api/capabilities';
import styles from './GuardrailReviewQueuePage.module.css';

function formatDateTime(value: string): string {
  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(date);
}

function formatOptionalValue(value: string | null | undefined, fallback: string): string {
  return value?.trim() ? value : fallback;
}

function GuardrailReviewQueueLoadingState() {
  return (
    <div
      className={`sapphire-stack sapphire-stack--gap-lg ${styles.loadingCards}`}
      role="status"
      aria-live="polite"
      aria-busy="true"
      aria-label="Loading guardrail review queue"
    >
      {[0, 1].map((index) => (
        <section key={index} className="sapphire-card sapphire-stack sapphire-stack--gap-md">
          <div className={`sapphire-row ${styles.cardHeader}`}>
            <div className="sapphire-stack sapphire-stack--gap-xs" style={{ flex: 1 }}>
              <LoadingSkeleton width="16rem" height="1.5rem" />
              <LoadingSkeleton width="100%" height="1rem" />
            </div>

            <div className={styles.cardBadges}>
              <LoadingSkeleton width="6rem" height="1.5rem" radius="pill" />
              <LoadingSkeleton width="7rem" height="1.5rem" radius="pill" />
            </div>
          </div>

          <div className={styles.detailGrid}>
            {[0, 1, 2, 3].map((detailIndex) => (
              <div key={detailIndex} className="sapphire-stack sapphire-stack--gap-xs">
                <LoadingSkeleton width="4rem" height="0.7rem" />
                <LoadingSkeleton width="100%" height="1rem" />
              </div>
            ))}
          </div>

          <LoadingSkeleton width="8rem" height="0.9rem" />
          <LoadingSkeleton width="100%" height="3rem" />
        </section>
      ))}
    </div>
  );
}

function DetailField({
  label,
  value,
}: {
  label: string;
  value: string;
}) {
  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <span className="sapphire-text sapphire-text--caption-sm sapphire-text--secondary">
        {label}
      </span>
      <span className="sapphire-text sapphire-text--body-sm">{value}</span>
    </div>
  );
}

export function GuardrailReviewQueuePage() {
  const flaggedCapabilitiesQuery = useFlaggedCapabilities();

  if (flaggedCapabilitiesQuery.isLoading) {
    return <GuardrailReviewQueueLoadingState />;
  }

  if (flaggedCapabilitiesQuery.error) {
    return (
      <StateMessageCard
        title="Error loading guardrail review queue"
        description={flaggedCapabilitiesQuery.error.message}
        variant="error"
        role="alert"
        action={(
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={() => {
              void flaggedCapabilitiesQuery.refetch();
            }}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        )}
      />
    );
  }

  const items = flaggedCapabilitiesQuery.data?.items ?? [];
  const hasMore = flaggedCapabilitiesQuery.data?.hasMore ?? false;
  const summaryLabel =
    items.length === 0
      ? 'No flagged capabilities require review'
      : !hasMore && items.length === 1
        ? '1 flagged capability requires review'
        : `${items.length}${hasMore ? '+' : ''} flagged capabilities require review`;

  return (
    <div className="sapphire-stack sapphire-stack--gap-xl">
      <div className={`sapphire-row ${styles.pageHeader}`}>
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <h2 className="sapphire-text sapphire-text--heading-lg">Guardrail review queue</h2>
          <p className="sapphire-text sapphire-text--body-md sapphire-text--secondary">
            Review capability names that matched blocked terms, confirm the override state, and
            capture the recorded rationale.
          </p>
        </div>

        <p
          className={`sapphire-text sapphire-text--body-sm sapphire-text--secondary ${styles.summary}`}
          aria-live="polite"
          aria-atomic="true"
        >
          {summaryLabel}
        </p>
      </div>

      {items.length === 0 ? (
        <StateMessageCard
          title="No flagged capabilities"
          description="Capability names that match the guardrail blocklist will appear here for review."
          role="status"
        />
      ) : (
        <div className={styles.queueList}>
          {items.map((item) => (
            <article key={item.id} className="sapphire-card sapphire-stack sapphire-stack--gap-md">
              <div className={`sapphire-row ${styles.cardHeader}`}>
                <div className="sapphire-stack sapphire-stack--gap-xs" style={{ flex: 1 }}>
                  <Link
                    to={`/capabilities/${item.id}`}
                    className={styles.titleLink}
                    aria-label={`Open capability ${item.uniqueName}`}
                  >
                    <h3 className="sapphire-text sapphire-text--heading-xs">{item.uniqueName}</h3>
                  </Link>
                  <p className={`sapphire-text sapphire-text--body-sm ${styles.warningMessage}`}>
                    {item.warningMessage}
                  </p>
                </div>

                <div className={styles.cardBadges}>
                  <CapabilityStatusBadge status={item.lifecycleStatus} size="sm" />
                  <span
                    className={`sapphire-badge sapphire-badge--sm sapphire-badge--${
                      item.nameGuardrailOverride ? 'positive' : 'warning'
                    }`}
                  >
                    {item.nameGuardrailOverride ? 'Override recorded' : 'Override pending'}
                  </span>
                </div>
              </div>

              <div className={styles.detailGrid}>
                <DetailField
                  label="Domain"
                  value={formatOptionalValue(item.domain, 'Not assigned')}
                />
                <DetailField
                  label="Steward"
                  value={formatOptionalValue(item.stewardId, 'Not assigned')}
                />
                <DetailField
                  label="Department"
                  value={formatOptionalValue(item.stewardDepartment, 'Not assigned')}
                />
                <DetailField label="Last updated" value={formatDateTime(item.updatedAt)} />
              </div>

              <section className="sapphire-stack sapphire-stack--gap-xs" aria-label="Matched terms">
                <h4 className="sapphire-text sapphire-text--heading-xs">Matched terms</h4>
                <div className={styles.terms}>
                  {item.matchedTerms.map((matchedTerm) => (
                    <span
                      key={`${item.id}-${matchedTerm}`}
                      className="sapphire-badge sapphire-badge--warning sapphire-badge--sm"
                    >
                      {matchedTerm}
                    </span>
                  ))}
                </div>
              </section>

              <section
                className="sapphire-stack sapphire-stack--gap-xs"
                aria-label="Recorded rationale"
              >
                <h4 className="sapphire-text sapphire-text--heading-xs">Recorded rationale</h4>
                {item.nameGuardrailOverrideRationale?.trim() ? (
                  <p className={`sapphire-text sapphire-text--body-sm ${styles.rationale}`}>
                    {item.nameGuardrailOverrideRationale}
                  </p>
                ) : (
                  <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                    No rationale recorded.
                  </p>
                )}
              </section>

              <div className={styles.actions}>
                <Link
                  to={`/capabilities/${item.id}`}
                  className="sapphire-button sapphire-button--secondary sapphire-button--sm"
                >
                  <span className="sapphire-button__content">Open capability</span>
                </Link>
                <Link
                  to={`/capabilities/${item.id}/edit`}
                  className="sapphire-button sapphire-button--tertiary sapphire-button--sm"
                >
                  <span className="sapphire-button__content">Edit metadata</span>
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}
    </div>
  );
}
