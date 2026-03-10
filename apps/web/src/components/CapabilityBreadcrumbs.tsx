import { Fragment, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import type { CapabilityBreadcrumb } from '../api/capabilities';
import { useCapabilityBreadcrumbs } from '../api/capabilities';
import { LoadingSkeleton } from './ui/LoadingSkeleton';
import styles from './CapabilityBreadcrumbs.module.css';

interface Props {
  id: string;
}

type BreadcrumbSegment =
  | { kind: 'crumb'; crumb: CapabilityBreadcrumb; isCurrent: boolean }
  | { kind: 'toggle' };

/**
 * Renders accessible breadcrumb navigation for a capability using the
 * /capabilities/:id/breadcrumbs endpoint, including a collapsed path affordance
 * for longer trails and a loading placeholder to avoid layout shift.
 */
export function CapabilityBreadcrumbs({ id }: Props) {
  const { data: crumbs, isLoading } = useCapabilityBreadcrumbs(id);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    setIsExpanded(false);
  }, [id]);

  const shouldCollapse = !!crumbs && crumbs.length > 3;
  const hiddenCrumbCount = crumbs ? Math.max(crumbs.length - 2, 0) : 0;
  const segments = useMemo<BreadcrumbSegment[]>(() => {
    if (!crumbs) {
      return [];
    }

    if (!shouldCollapse || isExpanded) {
      return crumbs.map((crumb, index) => ({
        kind: 'crumb' as const,
        crumb,
        isCurrent: index === crumbs.length - 1,
      }));
    }

    const firstCrumb = crumbs[0];
    const lastCrumb = crumbs[crumbs.length - 1];

    if (!firstCrumb || !lastCrumb) {
      return [];
    }

    return [
      {
        kind: 'crumb' as const,
        crumb: firstCrumb,
        isCurrent: false,
      },
      {
        kind: 'toggle' as const,
      },
      {
        kind: 'crumb' as const,
        crumb: lastCrumb,
        isCurrent: true,
      },
    ];
  }, [crumbs, isExpanded, shouldCollapse]);

  if (isLoading) {
    return (
      <nav aria-label="Breadcrumb" className={styles.container}>
        <div
          role="status"
          aria-live="polite"
          aria-busy="true"
          aria-label="Loading breadcrumbs"
        >
          <ol className={styles.list}>
            {[0, 1, 2].map((index) => (
              <Fragment key={index}>
                {index > 0 ? (
                  <li className={styles.separatorItem}>
                    <span className={styles.separator} aria-hidden="true">
                      /
                    </span>
                  </li>
                ) : null}
                <li className={styles.item}>
                  <LoadingSkeleton width={index === 1 ? '4rem' : '6rem'} height="0.8rem" />
                </li>
              </Fragment>
            ))}
          </ol>
        </div>
      </nav>
    );
  }

  if (!crumbs || crumbs.length === 0) return null;

  function renderCrumb(crumb: CapabilityBreadcrumb, isCurrent: boolean) {
    if (isCurrent) {
      return (
        <span className="sapphire-text sapphire-text--body-sm" aria-current="page">
          {crumb.uniqueName}
        </span>
      );
    }

    return (
      <Link
        to={`/capabilities/${crumb.id}`}
        className="sapphire-text sapphire-text--body-sm sapphire-text--accent"
        style={{ textDecoration: 'none' }}
      >
        {crumb.uniqueName}
      </Link>
    );
  }

  return (
    <nav aria-label="Breadcrumb" className={styles.container}>
      <ol className={styles.list}>
        {segments.map((segment, index) => {
          return (
            <Fragment
              key={segment.kind === 'crumb' ? `${segment.crumb.id}-${index}` : 'collapsed-toggle'}
            >
              {index > 0 ? (
                <li className={styles.separatorItem}>
                  <span className={styles.separator} aria-hidden="true">
                    /
                  </span>
                </li>
              ) : null}
              <li className={styles.item}>
                {segment.kind === 'crumb' ? (
                  renderCrumb(segment.crumb, segment.isCurrent)
                ) : (
                  <button
                    type="button"
                    className={`sapphire-text sapphire-text--body-sm ${styles.toggleButton}`}
                    aria-label={`Show ${hiddenCrumbCount} hidden breadcrumb ${hiddenCrumbCount === 1 ? 'item' : 'items'}`}
                    onClick={() => {
                      setIsExpanded(true);
                    }}
                  >
                    …
                  </button>
                )}
              </li>
            </Fragment>
          );
        })}
      </ol>

      {shouldCollapse && isExpanded ? (
        <button
          type="button"
          className={`sapphire-text sapphire-text--body-sm ${styles.collapseButton}`}
          onClick={() => {
            setIsExpanded(false);
          }}
        >
          Collapse path
        </button>
      ) : null}
    </nav>
  );
}
