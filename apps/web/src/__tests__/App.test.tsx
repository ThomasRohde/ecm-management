import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import type { ReactElement } from 'react';
import { App } from '../App';
import { AuthProvider } from '../contexts/AuthContext';

vi.mock('../components/ui/NotificationBell', () => ({
  NotificationBell: () => <div>Notification bell</div>,
}));

vi.mock('../api/auth', () => ({
  getStoredToken: vi.fn(() => null),
  getStoredUser: vi.fn(() => null),
  login: vi.fn(),
  register: vi.fn(),
  getMe: vi.fn(),
  persistAuth: vi.fn(),
  clearAuth: vi.fn(),
  AUTH_TOKEN_KEY: 'ecm:auth:token',
  AUTH_USER_KEY: 'ecm:auth:user',
}));

vi.mock('../api/identity', () => ({
  syncAuthToIdentity: vi.fn(),
  clearAuthFromIdentity: vi.fn(),
  getUserId: vi.fn(() => ''),
  getUserRole: vi.fn(() => ''),
  setUserId: vi.fn(),
  setUserRole: vi.fn(),
  getIdentityHeaders: vi.fn(() => ({})),
  KNOWN_ROLES: [],
}));

function renderApp(initialPath: string, outlet: ReactElement) {
  return render(
    <MemoryRouter initialEntries={[initialPath]}>
      <AuthProvider>
        <Routes>
          <Route path="/" element={<App />}>
            <Route path={initialPath.slice(1)} element={outlet} />
          </Route>
        </Routes>
      </AuthProvider>
    </MemoryRouter>
  );
}

describe('App navigation', () => {
  it('includes the guardrail review queue in the sidebar navigation', () => {
    renderApp('/guardrails/review-queue', <div>Guardrail queue outlet</div>);

    expect(screen.getByRole('link', { name: /guardrail reviews/i })).toHaveAttribute(
      'href',
      '/guardrails/review-queue',
    );
    expect(screen.getByText('Guardrail queue outlet')).toBeInTheDocument();
  });

  it('toggles the responsive sidebar open and closed', () => {
    renderApp('/capabilities', <div>Capabilities outlet</div>);

    const openButton = screen.getByRole('button', { name: /open navigation/i });

    fireEvent.click(openButton);

    expect(openButton).toHaveAttribute('aria-expanded', 'true');

    fireEvent.click(openButton);

    expect(openButton).toHaveAttribute('aria-expanded', 'false');
  });
});
