import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { BrowserRouter } from 'react-router-dom';
import { AuthBanner } from './AuthBanner';
import * as AuthContext from '../../contexts/AuthContext';
import { UserRole } from '@ecm/shared';

vi.mock('./NotificationBell', () => ({
  NotificationBell: () => <div>Notification bell</div>,
}));

const mockLogout = vi.fn();

const mockUnauthenticatedContext: AuthContext.AuthContextValue = {
  user: null,
  isAuthenticated: false,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: mockLogout,
  refreshUser: vi.fn(),
  hasRole: vi.fn(),
  hasAnyRole: vi.fn(),
};

const mockAuthenticatedContext: AuthContext.AuthContextValue = {
  user: {
    id: 'user-1',
    email: 'test@example.com',
    displayName: 'Test User',
    role: UserRole.CURATOR,
    isActive: true,
    createdAt: '2024-01-01T00:00:00Z',
    updatedAt: '2024-01-01T00:00:00Z',
  },
  isAuthenticated: true,
  isLoading: false,
  login: vi.fn(),
  register: vi.fn(),
  logout: mockLogout,
  refreshUser: vi.fn(),
  hasRole: vi.fn(),
  hasAnyRole: vi.fn(),
};

function renderAuthBanner(context: AuthContext.AuthContextValue) {
  vi.spyOn(AuthContext, 'useAuth').mockReturnValue(context);
  return render(
    <BrowserRouter>
      <AuthBanner />
    </BrowserRouter>
  );
}

describe('AuthBanner', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows sign in link when not authenticated', () => {
    renderAuthBanner(mockUnauthenticatedContext);

    expect(screen.getByText('Not signed in')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /sign in/i })).toHaveAttribute('href', '/login');
  });

  it('shows user info and sign out button when authenticated', () => {
    renderAuthBanner(mockAuthenticatedContext);

    expect(screen.getByText('Test User')).toBeInTheDocument();
    expect(screen.getByText('Curator')).toBeInTheDocument();
    expect(screen.getByText('Notification bell')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
  });

  it('calls logout when sign out button is clicked', async () => {
    const user = userEvent.setup();
    renderAuthBanner(mockAuthenticatedContext);

    await user.click(screen.getByRole('button', { name: /sign out/i }));

    expect(mockLogout).toHaveBeenCalledTimes(1);
  });

  it('formats role name correctly', () => {
    const governanceContext = {
      ...mockAuthenticatedContext,
      user: {
        ...mockAuthenticatedContext.user!,
        role: UserRole.GOVERNANCE_APPROVER,
      },
    };

    renderAuthBanner(governanceContext);

    expect(screen.getByText('Governance approver')).toBeInTheDocument();
  });

  it('formats role name for single word roles', () => {
    const viewerContext = {
      ...mockAuthenticatedContext,
      user: {
        ...mockAuthenticatedContext.user!,
        role: UserRole.VIEWER,
      },
    };

    renderAuthBanner(viewerContext);

    expect(screen.getByText('Viewer')).toBeInTheDocument();
  });
});
