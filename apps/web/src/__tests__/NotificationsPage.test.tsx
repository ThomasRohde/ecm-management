import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditEntityType, NotificationEventType, NotificationStatus, UserRole } from '@ecm/shared';
import { NotificationsPage } from '../pages/NotificationsPage';
import * as AuthContext from '../contexts/AuthContext';
import * as notificationsApi from '../api/notifications';

vi.mock('../api/notifications');

const mockMarkRead = vi.fn();
const mockDismiss = vi.fn();
const mockMarkAllRead = vi.fn();

const authenticatedContext: AuthContext.AuthContextValue = {
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
};

function renderPage() {
  return render(
    <BrowserRouter>
      <NotificationsPage />
    </BrowserRouter>,
  );
}

describe('NotificationsPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue(authenticatedContext);
    vi.mocked(notificationsApi.useMarkNotificationRead).mockReturnValue({
      mutate: mockMarkRead,
      isPending: false,
      error: null,
    } as never);
    vi.mocked(notificationsApi.useDismissNotification).mockReturnValue({
      mutate: mockDismiss,
      isPending: false,
      error: null,
    } as never);
    vi.mocked(notificationsApi.useMarkAllNotificationsRead).mockReturnValue({
      mutate: mockMarkAllRead,
      isPending: false,
      error: null,
    } as never);
  });

  it('shows sign-in guidance when unauthenticated', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      ...authenticatedContext,
      user: null,
      isAuthenticated: false,
    });
    vi.mocked(notificationsApi.useNotifications).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never);

    renderPage();

    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /go to the login page/i })).toBeInTheDocument();
  });

  it('shows a loading state while notifications are loading', () => {
    vi.mocked(notificationsApi.useNotifications).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as never);

    renderPage();

    expect(screen.getByRole('status', { name: /loading notifications/i })).toBeInTheDocument();
  });

  it('renders notifications and mutation actions', async () => {
    const user = userEvent.setup();
    vi.mocked(notificationsApi.useNotifications).mockReturnValue({
      data: {
        items: [
          {
            id: 'notification-1',
            recipientId: 'user-1',
            eventType: NotificationEventType.CHANGE_REQUEST_APPROVED,
            entityType: AuditEntityType.CHANGE_REQUEST,
            entityId: 'change-request-1',
            status: NotificationStatus.UNREAD,
            title: 'Change request approved',
            body: 'Your change request is ready to execute.',
            metadata: null,
            createdAt: '2024-01-01T00:00:00Z',
            readAt: null,
          },
        ],
        total: 1,
        unreadCount: 1,
      },
      isLoading: false,
      error: null,
    } as never);

    renderPage();

    expect(screen.getByText(/notifications inbox/i)).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: /change request approved/i }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open change request/i })).toHaveAttribute(
      'href',
      '/change-requests/change-request-1',
    );

    await user.click(screen.getByRole('button', { name: /mark all read/i }));
    await user.click(screen.getByRole('button', { name: /mark read/i }));
    await user.click(screen.getByRole('button', { name: /dismiss/i }));

    expect(mockMarkAllRead).toHaveBeenCalledTimes(1);
    expect(mockMarkRead).toHaveBeenCalledWith('notification-1');
    expect(mockDismiss).toHaveBeenCalledWith('notification-1');
  });
});
