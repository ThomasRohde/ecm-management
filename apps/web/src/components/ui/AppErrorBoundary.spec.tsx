import type { ReactElement } from 'react';
import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AppErrorBoundary } from './AppErrorBoundary';

function ThrowRenderError(): ReactElement {
  throw new Error('Boom');
}

describe('AppErrorBoundary', () => {
  const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

  beforeEach(() => {
    consoleErrorSpy.mockClear();
  });

  afterEach(() => {
    consoleErrorSpy.mockClear();
  });

  it('renders children when no render error occurs', () => {
    render(
      <AppErrorBoundary>
        <p>Healthy route</p>
      </AppErrorBoundary>,
    );

    expect(screen.getByText('Healthy route')).toBeInTheDocument();
  });

  it('renders the fallback shell when a child throws during render', () => {
    render(
      <AppErrorBoundary>
        <ThrowRenderError />
      </AppErrorBoundary>,
    );

    expect(
      screen.getByRole('heading', { name: /unexpected application error/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: /reload application/i }),
    ).toBeInTheDocument();
    expect(
      screen.getByRole('link', { name: /go to capabilities/i }),
    ).toHaveAttribute('href', '/capabilities');
    expect(consoleErrorSpy).toHaveBeenCalled();
  });
});
