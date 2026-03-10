import styles from './LoadingSkeleton.module.css';

type SkeletonRadius = 'sm' | 'md' | 'lg' | 'pill';

interface LoadingSkeletonProps {
  width?: string;
  height?: string;
  radius?: SkeletonRadius;
  className?: string;
}

const radiusClassNames: Record<SkeletonRadius, string | undefined> = {
  sm: styles.radiusSm,
  md: styles.radiusMd,
  lg: styles.radiusLg,
  pill: styles.radiusPill,
};

export function LoadingSkeleton({
  width = '100%',
  height = '1rem',
  radius = 'md',
  className,
}: LoadingSkeletonProps) {
  return (
    <span
      aria-hidden="true"
      className={[styles.skeleton, radiusClassNames[radius], className]
        .filter(Boolean)
        .join(' ')}
      style={{ width, height }}
    />
  );
}
