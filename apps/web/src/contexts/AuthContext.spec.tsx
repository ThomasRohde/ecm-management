import { renderHook, waitFor } from '@testing-library/react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import type { ReactNode } from 'react';
import { AuthProvider, useAuth } from './AuthContext';
import * as authApi from '../api/auth';
import * as identity from '../api/identity';
import { UserRole } from '@ecm/shared';

vi.mock('../api/auth');
vi.mock('../api/identity');

const mockUser = {
  id: 'user-1',
  email: 'test@example.com',
  displayName: 'Test User',
  role: UserRole.CURATOR,
  isActive: true,
  createdAt: '2024-01-01T00:00:00Z',
  updatedAt: '2024-01-01T00:00:00Z',
};

const mockLoginResponse = {
  accessToken: 'mock-token',
  user: mockUser,
};

function wrapper({ children }: { children: ReactNode }) {
  return <AuthProvider>{children}</AuthProvider>;
}

describe('AuthContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
    vi.mocked(authApi.getStoredToken).mockReturnValue(null);
    vi.mocked(authApi.getStoredUser).mockReturnValue(null);
  });

  afterEach(() => {
    localStorage.clear();
  });

  it('initializes with no user when no token is stored', async () => {
    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
  });

  it('validates stored token on mount', async () => {
    vi.mocked(authApi.getStoredToken).mockReturnValue('existing-token');
    vi.mocked(authApi.getStoredUser).mockReturnValue(mockUser);
    vi.mocked(authApi.getMe).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toEqual(mockUser);
    expect(result.current.isAuthenticated).toBe(true);
    expect(authApi.getMe).toHaveBeenCalled();
  });

  it('clears auth when token validation fails', async () => {
    vi.mocked(authApi.getStoredToken).mockReturnValue('invalid-token');
    vi.mocked(authApi.getStoredUser).mockReturnValue(mockUser);
    vi.mocked(authApi.getMe).mockRejectedValue(new Error('Token expired'));

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    expect(result.current.user).toBeNull();
    expect(result.current.isAuthenticated).toBe(false);
    expect(authApi.clearAuth).toHaveBeenCalled();
    expect(identity.clearAuthFromIdentity).toHaveBeenCalled();
  });

  it('logs in successfully and syncs identity', async () => {
    vi.mocked(authApi.login).mockResolvedValue(mockLoginResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.login('test@example.com', 'password');

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(identity.syncAuthToIdentity).toHaveBeenCalledWith(mockUser);
  });

  it('registers successfully and syncs identity', async () => {
    vi.mocked(authApi.register).mockResolvedValue(mockLoginResponse);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isLoading).toBe(false);
    });

    await result.current.register('test@example.com', 'Test User', 'password');

    await waitFor(() => {
      expect(result.current.user).toEqual(mockUser);
      expect(result.current.isAuthenticated).toBe(true);
    });
    expect(identity.syncAuthToIdentity).toHaveBeenCalledWith(mockUser);
  });

  it('logs out successfully and clears identity', async () => {
    vi.mocked(authApi.getStoredToken).mockReturnValue('token');
    vi.mocked(authApi.getStoredUser).mockReturnValue(mockUser);
    vi.mocked(authApi.getMe).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    result.current.logout();

    await waitFor(() => {
      expect(result.current.user).toBeNull();
      expect(result.current.isAuthenticated).toBe(false);
    });
    expect(authApi.clearAuth).toHaveBeenCalled();
    expect(identity.clearAuthFromIdentity).toHaveBeenCalled();
  });

  it('checks role correctly', async () => {
    vi.mocked(authApi.getStoredToken).mockReturnValue('token');
    vi.mocked(authApi.getStoredUser).mockReturnValue(mockUser);
    vi.mocked(authApi.getMe).mockResolvedValue(mockUser);

    const { result } = renderHook(() => useAuth(), { wrapper });

    await waitFor(() => {
      expect(result.current.isAuthenticated).toBe(true);
    });

    expect(result.current.hasRole(UserRole.CURATOR)).toBe(true);
    expect(result.current.hasRole(UserRole.ADMIN)).toBe(false);
    expect(result.current.hasAnyRole([UserRole.CURATOR, UserRole.ADMIN])).toBe(true);
    expect(result.current.hasAnyRole([UserRole.VIEWER, UserRole.ADMIN])).toBe(false);
  });

  it('throws error when useAuth is used outside AuthProvider', () => {
    expect(() => {
      renderHook(() => useAuth());
    }).toThrow('useAuth must be used within an AuthProvider');
  });
});
