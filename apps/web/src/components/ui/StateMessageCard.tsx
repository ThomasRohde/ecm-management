import type { ReactNode } from 'react';
import styles from './StateMessageCard.module.css';

type StateMessageVariant = 'neutral' | 'error';

interface StateMessageCardProps {
  title: string;
  description: ReactNode;
  variant?: StateMessageVariant;
  action?: ReactNode;
  role?: 'alert' | 'status';
}

const variantIcons: Record<StateMessageVariant, string> = {
  neutral: 'i',
  error: '!',
};

export function StateMessageCard({
  title,
  description,
  variant = 'neutral',
  action,
  role,
}: StateMessageCardProps) {
  const variantClassName = variant === 'error' ? styles.error : styles.neutral;
  const ariaLive = role === 'alert' ? 'assertive' : role === 'status' ? 'polite' : undefined;

  return (
    <div
      className={`sapphire-card sapphire-stack sapphire-stack--gap-xs ${styles.card} ${variantClassName}`}
      role={role}
      aria-live={ariaLive}
    >
      <div className={styles.header}>
        <span className={styles.icon} aria-hidden="true">
          {variantIcons[variant]}
        </span>
        <div className={`sapphire-stack sapphire-stack--gap-xs ${styles.content}`}>
          <h3 className="sapphire-text sapphire-text--heading-xs">{title}</h3>
          <div className="sapphire-text sapphire-text--body-sm sapphire-text--secondary">
            {description}
          </div>
          {action ? <div className={styles.action}>{action}</div> : null}
        </div>
      </div>
    </div>
  );
}
