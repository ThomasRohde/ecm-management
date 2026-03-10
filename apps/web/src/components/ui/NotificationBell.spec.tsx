import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { UserRole } from '@ecm/shared';
import { NotificationBell } from './NotificationBell';
import * as AuthContext from '../../contexts/AuthContext';
import * as notificationsApi from '../../api/notifications';

vi.mock('../../api/notifications');

describe('NotificationBell', () => {
  it('does not render for unauthenticated users', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: null,
      isAuthenticated: false,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });
    vi.mocked(notificationsApi.useNotifications).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never);

    render(
      <BrowserRouter>
        <NotificationBell />
      </BrowserRouter>,
    );

    expect(screen.queryByRole('link', { name: /open notifications inbox/i })).not.toBeInTheDocument();
  });

  it('renders unread count for authenticated users', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      user: {
        id: 'user-1',
        email: 'user@example.com',
        displayName: 'User',
        role: UserRole.CURATOR,
        isActive: true,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
      hasRole: vi.fn(),
      hasAnyRole: vi.fn(),
    });
    vi.mocked(notificationsApi.useNotifications).mockReturnValue({
      data: {
        items: [],
        total: 0,
        unreadCount: 3,
      },
      isLoading: false,
      error: null,
    } as never);

    render(
      <BrowserRouter>
        <NotificationBell />
      </BrowserRouter>,
    );

    expect(screen.getByRole('link', { name: /3 unread/i })).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });
});
