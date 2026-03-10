import { useEffect, useState } from 'react';
import styles from './CapabilitySearchBar.module.css';

interface CapabilitySearchBarProps {
  initialValue?: string;
  isDisabled?: boolean;
  statusMessage?: string;
  delayMs?: number;
  onSearchChange: (value: string) => void;
}

export function CapabilitySearchBar({
  initialValue = '',
  isDisabled = false,
  statusMessage,
  delayMs = 300,
  onSearchChange,
}: CapabilitySearchBarProps) {
  const [value, setValue] = useState(initialValue);

  useEffect(() => {
    setValue(initialValue);
  }, [initialValue]);

  useEffect(() => {
    const timer = window.setTimeout(() => {
      onSearchChange(value.trim());
    }, delayMs);

    return () => window.clearTimeout(timer);
  }, [delayMs, onSearchChange, value]);

  return (
    <div
      role="search"
      aria-label="Search and filter capabilities"
      className={styles.container}
      aria-busy={statusMessage ? 'true' : undefined}
    >
      <label
        htmlFor="capability-search"
        className="sapphire-text sapphire-text--body-sm sapphire-text--secondary"
      >
        Search capabilities
      </label>
      <input
        id="capability-search"
        type="search"
        placeholder="Search by capability name"
        className={`sapphire-text-field ${styles.input}`}
        value={value}
        onChange={(event) => {
          setValue(event.target.value);
        }}
        autoComplete="off"
        disabled={isDisabled}
      />
      {statusMessage ? (
        <p
          className="sapphire-text sapphire-text--body-xs sapphire-text--secondary"
          role="status"
          aria-live="polite"
        >
          {statusMessage}
        </p>
      ) : null}
    </div>
  );
}
