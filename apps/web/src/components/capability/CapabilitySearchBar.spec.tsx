import { fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { CapabilitySearchBar } from './CapabilitySearchBar';

describe('CapabilitySearchBar', () => {
  beforeEach(() => {
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.runOnlyPendingTimers();
    vi.useRealTimers();
  });

  it('debounces search changes before notifying the page', () => {
    const onSearchChange = vi.fn();

    render(
      <CapabilitySearchBar
        initialValue=""
        delayMs={300}
        onSearchChange={onSearchChange}
      />,
    );

    fireEvent.change(screen.getByRole('searchbox'), {
      target: { value: 'Payments' },
    });

    expect(onSearchChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(299);
    expect(onSearchChange).not.toHaveBeenCalled();

    vi.advanceTimersByTime(1);
    expect(onSearchChange).toHaveBeenLastCalledWith('Payments');
  });

  it('announces active search requests', () => {
    render(
      <CapabilitySearchBar
        initialValue="Payments"
        statusMessage="Searching capabilities…"
        onSearchChange={vi.fn()}
      />,
    );

    expect(
      screen.getByRole('search', { name: /search and filter capabilities/i }),
    ).toHaveAttribute('aria-busy', 'true');
    expect(screen.getByRole('status')).toHaveTextContent(/searching capabilities/i);
  });
});
