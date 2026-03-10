import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { login, register, getMe, persistAuth, clearAuth, getStoredToken, getStoredUser } from './auth';
import * as client from './client';
import { UserRole } from '@ecm/shared';

vi.mock('./client');

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
  accessToken: 'test-token-123',
  user: mockUser,
};

describe('auth API client', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('persistAuth', () => {
    it('stores token and user in localStorage', () => {
      persistAuth('test-token', mockUser);

      expect(localStorage.getItem('ecm:auth:token')).toBe('test-token');
      const storedUser = JSON.parse(localStorage.getItem('ecm:auth:user') ?? '');
      expect(storedUser).toEqual(mockUser);
    });
  });

  describe('clearAuth', () => {
    it('removes token and user from localStorage', () => {
      localStorage.setItem('ecm:auth:token', 'test-token');
      localStorage.setItem('ecm:auth:user', JSON.stringify(mockUser));

      clearAuth();

      expect(localStorage.getItem('ecm:auth:token')).toBeNull();
      expect(localStorage.getItem('ecm:auth:user')).toBeNull();
    });
  });

  describe('getStoredToken', () => {
    it('returns stored token', () => {
      localStorage.setItem('ecm:auth:token', 'stored-token');
      expect(getStoredToken()).toBe('stored-token');
    });

    it('returns null when no token stored', () => {
      expect(getStoredToken()).toBeNull();
    });
  });

  describe('getStoredUser', () => {
    it('returns parsed user object', () => {
      localStorage.setItem('ecm:auth:user', JSON.stringify(mockUser));
      expect(getStoredUser()).toEqual(mockUser);
    });

    it('returns null when no user stored', () => {
      expect(getStoredUser()).toBeNull();
    });

    it('returns null when stored data is invalid JSON', () => {
      localStorage.setItem('ecm:auth:user', 'invalid-json');
      expect(getStoredUser()).toBeNull();
    });
  });

  describe('login', () => {
    it('calls API and persists auth on success', async () => {
      vi.mocked(client.apiClient.post).mockResolvedValue(mockLoginResponse);

      const result = await login('test@example.com', 'password123');

      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/login', {
        email: 'test@example.com',
        password: 'password123',
      });
      expect(result).toEqual(mockLoginResponse);
      expect(localStorage.getItem('ecm:auth:token')).toBe('test-token-123');
    });
  });

  describe('register', () => {
    it('calls API with all fields and persists auth on success', async () => {
      vi.mocked(client.apiClient.post).mockResolvedValue(mockLoginResponse);

      const result = await register('new@example.com', 'New User', 'password123', UserRole.VIEWER);

      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/register', {
        email: 'new@example.com',
        displayName: 'New User',
        password: 'password123',
        role: UserRole.VIEWER,
      });
      expect(result).toEqual(mockLoginResponse);
      expect(localStorage.getItem('ecm:auth:token')).toBe('test-token-123');
    });

    it('calls API without role when not provided', async () => {
      vi.mocked(client.apiClient.post).mockResolvedValue(mockLoginResponse);

      await register('new@example.com', 'New User', 'password123');

      expect(client.apiClient.post).toHaveBeenCalledWith('/auth/register', {
        email: 'new@example.com',
        displayName: 'New User',
        password: 'password123',
      });
    });
  });

  describe('getMe', () => {
    it('fetches current user with stored token', async () => {
      localStorage.setItem('ecm:auth:token', 'valid-token');
      vi.mocked(client.apiClient.get).mockResolvedValue(mockUser);

      const result = await getMe();

      expect(client.apiClient.get).toHaveBeenCalledWith('/auth/me', {
        Authorization: 'Bearer valid-token',
      });
      expect(result).toEqual(mockUser);
    });

    it('throws error when no token is stored', async () => {
      await expect(getMe()).rejects.toThrow('Not authenticated');
    });
  });
});
