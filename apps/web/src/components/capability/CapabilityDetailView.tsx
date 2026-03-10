import type { ReactNode } from 'react';
import type { CapabilityStewardship } from '@ecm/shared';
import { Link } from 'react-router-dom';
import type { CapabilityDetail } from '../../api/capabilities';
import { CapabilityHierarchyExplorer } from '../CapabilityHierarchyExplorer';
import { LoadingSkeleton } from '../ui/LoadingSkeleton';
import {
  CapabilityStatusBadge,
  CapabilityStewardshipSourceBadge,
  CapabilityTypeBadge,
} from './CapabilityBadges';
import styles from './CapabilityDetailView.module.css';

interface CapabilityDetailViewProps {
  capability: CapabilityDetail;
  stewardship?: CapabilityStewardship;
  stewardshipIsLoading: boolean;
  stewardshipError: Error | null;
  onRetryStewardship: () => void;
  canDelete: boolean;
}

function formatDate(value: string | null): string {
  if (!value) {
    return 'Not set';
  }

  const date = new Date(value);

  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
  }).format(date);
}

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

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
}

function DetailField({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="sapphire-stack sapphire-stack--gap-xs">
      <span className="sapphire-text sapphire-text--caption-sm sapphire-text--secondary">
        {label}
      </span>
      <div className="sapphire-text sapphire-text--body-sm">{children}</div>
    </div>
  );
}

function renderOptionalValue(value: string | null | undefined, fallback: string) {
  return value?.trim() ? value : (
    <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
      {fallback}
    </span>
  );
}

function renderBadgeList(
  values: string[],
  emptyLabel: string,
  variant: 'neutral' | 'accent',
) {
  if (values.length === 0) {
    return (
      <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        {emptyLabel}
      </span>
    );
  }

  return (
    <div className={styles.badgeList}>
      {values.map((value) => (
        <span
          key={value}
          className={`sapphire-badge sapphire-badge--sm sapphire-badge--${variant}`}
        >
          {value}
        </span>
      ))}
    </div>
  );
}

export function CapabilityDetailView({
  capability,
  stewardship,
  stewardshipIsLoading,
  stewardshipError,
  onRetryStewardship,
  canDelete,
}: CapabilityDetailViewProps) {
  const inheritedSourceLabel =
    stewardship?.sourceCapabilityId && capability.parent?.id === stewardship.sourceCapabilityId
      ? capability.parent.uniqueName
      : stewardship?.sourceCapabilityId;

  function renderStewardshipDetail(): ReactNode {
    if (stewardshipIsLoading) {
      return (
        <div role="status" aria-live="polite" aria-busy="true">
          <LoadingSkeleton width="10rem" height="1rem" />
        </div>
      );
    }

    if (stewardshipError) {
      return (
        <div className="sapphire-stack sapphire-stack--gap-xs">
          <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Unable to load stewardship assignment.
          </span>
          <button
            type="button"
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
            onClick={onRetryStewardship}
          >
            <span className="sapphire-button__content">Retry</span>
          </button>
        </div>
      );
    }

    if (!stewardship) {
      return (
        <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          No stewardship data available.
        </span>
      );
    }

    return <CapabilityStewardshipSourceBadge source={stewardship.source} />;
  }

  function renderEffectiveStewardshipValue(
    value: string | null | undefined,
    emptyLabel: string,
  ) {
    if (stewardshipIsLoading) {
      return <LoadingSkeleton width="8rem" height="1rem" />;
    }

    if (stewardshipError) {
      return (
        <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Unavailable
        </span>
      );
    }

    return renderOptionalValue(value ?? null, emptyLabel);
  }

  function renderSourceCapability() {
    if (stewardshipIsLoading) {
      return <LoadingSkeleton width="10rem" height="1rem" />;
    }

    if (stewardshipError) {
      return (
        <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Unavailable
        </span>
      );
    }

    if (stewardship?.source === 'INHERITED' && stewardship.sourceCapabilityId) {
      return (
        <Link
          to={`/capabilities/${stewardship.sourceCapabilityId}`}
          className={`sapphire-text sapphire-text--body-sm sapphire-text--accent ${styles.link}`}
        >
          Inherited from {inheritedSourceLabel ?? stewardship.sourceCapabilityId}
        </Link>
      );
    }

    if (stewardship?.source === 'DIRECT') {
      return (
        <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
          Assigned on this capability
        </span>
      );
    }

    return (
      <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
        Not applicable
      </span>
    );
  }

  return (
    <div className="sapphire-stack sapphire-stack--gap-lg">
      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <h3 className="sapphire-text sapphire-text--heading-xs">Capability narrative</h3>

        <div className={styles.narrativeGrid}>
          <DetailField label="DESCRIPTION">
            <p className={styles.textBlock}>
              {capability.description?.trim()
                ? capability.description
                : 'No description provided yet.'}
            </p>
          </DetailField>
          <DetailField label="RATIONALE">
            <p className={styles.textBlock}>
              {capability.rationale?.trim() ? capability.rationale : 'No rationale recorded.'}
            </p>
          </DetailField>
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <h3 className="sapphire-text sapphire-text--heading-xs">Identity &amp; hierarchy</h3>

        <div className={styles.metadataGrid}>
          <DetailField label="CAPABILITY ID">{capability.id}</DetailField>
          <DetailField label="TYPE">
            <CapabilityTypeBadge type={capability.type} />
          </DetailField>
          <DetailField label="LIFECYCLE STATUS">
            <CapabilityStatusBadge status={capability.lifecycleStatus} />
          </DetailField>
          <DetailField label="PARENT">
            {capability.parent ? (
              <Link
                to={`/capabilities/${capability.parent.id}`}
                className={`sapphire-text sapphire-text--body-sm sapphire-text--accent ${styles.link}`}
              >
                {capability.parent.uniqueName}
              </Link>
            ) : (
              <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                Top-level capability
              </span>
            )}
          </DetailField>
          <DetailField label="EFFECTIVE FROM">{formatDate(capability.effectiveFrom)}</DetailField>
          <DetailField label="EFFECTIVE TO">{formatDate(capability.effectiveTo)}</DetailField>
          <DetailField label="CREATED">{formatDateTime(capability.createdAt)}</DetailField>
          <DetailField label="LAST UPDATED">{formatDateTime(capability.updatedAt)}</DetailField>
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <div className={`sapphire-row ${styles.sectionHeader}`}>
          <h3 className="sapphire-text sapphire-text--heading-xs">Stewardship</h3>
          <Link
            to={`/capabilities/${capability.id}/edit`}
            className="sapphire-button sapphire-button--secondary sapphire-button--sm"
          >
            <span className="sapphire-button__content">Manage stewardship</span>
          </Link>
        </div>

        <div className={styles.metadataGrid}>
          <DetailField label="ASSIGNMENT SOURCE">{renderStewardshipDetail()}</DetailField>
          <DetailField label="DIRECT STEWARD ID">
            {renderOptionalValue(capability.stewardId, 'No direct steward on this capability')}
          </DetailField>
          <DetailField label="DIRECT STEWARD DEPARTMENT">
            {renderOptionalValue(
              capability.stewardDepartment,
              'No direct steward department on this capability',
            )}
          </DetailField>
          <DetailField label="EFFECTIVE STEWARD ID">
            {renderEffectiveStewardshipValue(stewardship?.stewardId, 'Not assigned')}
          </DetailField>
          <DetailField label="EFFECTIVE STEWARD DEPARTMENT">
            {renderEffectiveStewardshipValue(stewardship?.stewardDepartment, 'Not assigned')}
          </DetailField>
          <DetailField label="SOURCE CAPABILITY">{renderSourceCapability()}</DetailField>
        </div>

        {stewardship?.source === 'INHERITED' ? (
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Stewardship is inherited from an ancestor capability until a direct steward is assigned
            here.
          </p>
        ) : null}

        {!canDelete ? (
          <p className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            Only draft capabilities without child capabilities can be deleted.
          </p>
        ) : null}
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-lg">
        <h3 className="sapphire-text sapphire-text--heading-xs">Governance metadata</h3>

        <div className={styles.metadataGrid}>
          <DetailField label="DOMAIN">
            {renderOptionalValue(capability.domain, 'Not set')}
          </DetailField>
          <DetailField label="ALIASES">
            {renderBadgeList(capability.aliases, 'No aliases', 'neutral')}
          </DetailField>
          <DetailField label="TAGS">
            {renderBadgeList(capability.tags, 'No tags', 'accent')}
          </DetailField>
          <DetailField label="SOURCE REFERENCES">
            {capability.sourceReferences.length > 0 ? (
              <ul className={styles.referenceList}>
                {capability.sourceReferences.map((reference) => (
                  <li key={reference}>
                    {isHttpUrl(reference) ? (
                      <a
                        href={reference}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="sapphire-text sapphire-text--body-sm sapphire-text--accent"
                      >
                        {reference}
                      </a>
                    ) : (
                      <span className="sapphire-text sapphire-text--body-sm">{reference}</span>
                    )}
                  </li>
                ))}
              </ul>
            ) : (
              <span className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
                No source references
              </span>
            )}
          </DetailField>
        </div>
      </section>

      <section className="sapphire-card sapphire-stack sapphire-stack--gap-md">
        <h3 className="sapphire-text sapphire-text--heading-xs">Child capabilities</h3>
        <CapabilityHierarchyExplorer
          id={capability.id}
          directChildren={capability.children}
        />
      </section>
    </div>
  );
}
