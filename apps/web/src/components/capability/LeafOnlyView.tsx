import { useMemo } from 'react';
import { Link } from 'react-router-dom';
import { CapabilityType } from '@ecm/shared';
import type { CapabilitySummary } from '../../api/capabilities';
import { ActiveChangeRequestsBadge } from '../change-request/ChangeRequestBadges';
import { StateMessageCard } from '../ui/StateMessageCard';
import {
  CapabilityStatusBadge,
  CapabilityTypeBadge,
} from './CapabilityBadges';
import styles from './LeafOnlyView.module.css';

interface LeafOnlyViewProps {
  capabilities: CapabilitySummary[];
  searchTerm?: string;
  hasActiveFilters?: boolean;
  /** Maps capability ID to the count of active (in-flight) change requests. */
  activeChangeRequestCountById?: ReadonlyMap<string, number>;
}

export function LeafOnlyView({
  capabilities,
  searchTerm = '',
  hasActiveFilters = false,
  activeChangeRequestCountById,
}: LeafOnlyViewProps) {
  const visibleLeafCapabilities = useMemo(() => {
    const normalizedSearchTerm = searchTerm.trim().toLowerCase();

    return capabilities.filter((capability) => {
      if (capability.type !== CapabilityType.LEAF) {
        return false;
      }

      if (!normalizedSearchTerm) {
        return true;
      }

      return (
        capability.uniqueName.toLowerCase().includes(normalizedSearchTerm) ||
        capability.description?.toLowerCase().includes(normalizedSearchTerm)
      );
    });
  }, [capabilities, searchTerm]);

  if (visibleLeafCapabilities.length === 0) {
    return (
      <StateMessageCard
        title={
          searchTerm.trim() || hasActiveFilters ? 'No matching leaf capabilities' : 'No leaf capabilities'
        }
        description={
          searchTerm.trim() || hasActiveFilters
            ? 'No leaf capabilities match the current search or filters.'
            : 'No leaf capabilities found.'
        }
      />
    );
  }

  return (
    <div className={styles.list}>
      {visibleLeafCapabilities.map((capability) => (
        <Link
          key={capability.id}
          to={`/capabilities/${capability.id}`}
          className={`sapphire-card ${styles.item}`}
        >
          <div
            className="sapphire-row sapphire-row--gap-sm"
            style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}
          >
            <h3 className="sapphire-text sapphire-text--heading-xs">
              {capability.uniqueName}
            </h3>
            <div className="sapphire-row sapphire-row--gap-xs">
              <CapabilityStatusBadge status={capability.lifecycleStatus} size="sm" />
              <CapabilityTypeBadge type={capability.type} size="sm" />
              <ActiveChangeRequestsBadge
                count={activeChangeRequestCountById?.get(capability.id) ?? 0}
                size="sm"
              />
            </div>
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
      ))}
    </div>
  );
}
