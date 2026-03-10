import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { AuditAction, AuditEntityType, UserRole } from '@ecm/shared';
import { AuditTrailPage } from '../pages/AuditTrailPage';
import * as AuthContext from '../contexts/AuthContext';
import * as auditApi from '../api/audit';
import * as permissions from '../auth/permissions';

vi.mock('../api/audit');
vi.mock('../auth/permissions', () => ({
  canViewAudit: vi.fn(),
  getPermissionDeniedMessage: vi.fn(() => 'You do not have permission to view the audit trail.'),
}));

const adminContext: AuthContext.AuthContextValue = {
  user: {
    id: 'admin-1',
    email: 'admin@example.com',
    displayName: 'Admin User',
    role: UserRole.ADMIN,
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
      <AuditTrailPage />
    </BrowserRouter>,
  );
}

describe('AuditTrailPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue(adminContext);
    vi.mocked(permissions.canViewAudit).mockReturnValue(true);
  });

  it('shows sign-in guidance when unauthenticated', () => {
    vi.spyOn(AuthContext, 'useAuth').mockReturnValue({
      ...adminContext,
      user: null,
      isAuthenticated: false,
    });
    vi.mocked(auditApi.useAuditEntries).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never);

    renderPage();

    expect(screen.getByText(/sign in required/i)).toBeInTheDocument();
  });

  it('shows a permission message when the user cannot view audit', () => {
    vi.mocked(permissions.canViewAudit).mockReturnValue(false);
    vi.mocked(auditApi.useAuditEntries).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: null,
    } as never);

    renderPage();

    expect(screen.getByText(/insufficient permissions/i)).toBeInTheDocument();
    expect(screen.getByText(/do not have permission/i)).toBeInTheDocument();
  });

  it('renders audit entries for authorized users', () => {
    vi.mocked(auditApi.useAuditEntries).mockReturnValue({
      data: {
        items: [
          {
            id: 'audit-1',
            entityType: AuditEntityType.CHANGE_REQUEST,
            entityId: 'change-request-1',
            action: AuditAction.APPROVE,
            actorId: 'admin-1',
            before: null,
            after: { status: 'APPROVED' },
            metadata: { source: 'test' },
            timestamp: '2024-01-01T00:00:00Z',
          },
        ],
        total: 1,
      },
      isLoading: false,
      error: null,
    } as never);

    renderPage();

    expect(screen.getByText(/audit trail/i)).toBeInTheDocument();
    expect(screen.getByText(/CHANGE_REQUEST APPROVE/i)).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open change request/i })).toHaveAttribute(
      'href',
      '/change-requests/change-request-1',
    );
    expect(screen.getByText(/after snapshot/i)).toBeInTheDocument();
  });
});
