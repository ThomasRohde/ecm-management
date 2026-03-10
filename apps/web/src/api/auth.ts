import { apiClient } from './client';
import type { User, LoginResponse, CreateUserInput, UserRole } from '@ecm/shared';

// ─── Storage keys ─────────────────────────────────────────────────────────────

/** Shared with identity.ts – must stay in sync with AUTH_TOKEN_KEY there. */
export const AUTH_TOKEN_KEY = 'ecm:auth:token';
/** Shared with identity.ts – must stay in sync with AUTH_USER_KEY there. */
export const AUTH_USER_KEY = 'ecm:auth:user';

// ─── Persistence helpers ──────────────────────────────────────────────────────

export function getStoredToken(): string | null {
  return localStorage.getItem(AUTH_TOKEN_KEY);
}

export function getStoredUser(): User | null {
  const raw = localStorage.getItem(AUTH_USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as User;
  } catch {
    return null;
  }
}

export function persistAuth(token: string, user: User): void {
  localStorage.setItem(AUTH_TOKEN_KEY, token);
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

export function clearAuth(): void {
  localStorage.removeItem(AUTH_TOKEN_KEY);
  localStorage.removeItem(AUTH_USER_KEY);
}

// ─── API calls ────────────────────────────────────────────────────────────────

/** Authenticate with email + password. Persists the token on success. */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await apiClient.post<LoginResponse>('/auth/login', { email, password });
  persistAuth(result.accessToken, result.user);
  return result;
}

/** Register a new account. Persists the token on success. */
export async function register(
  email: string,
  displayName: string,
  password: string,
  role?: UserRole,
): Promise<LoginResponse> {
  const body: CreateUserInput = { email, displayName, password, ...(role ? { role } : {}) };
  const result = await apiClient.post<LoginResponse>('/auth/register', body);
  persistAuth(result.accessToken, result.user);
  return result;
}

/** Fetch the current user's profile using the stored JWT. */
export async function getMe(): Promise<User> {
  const token = getStoredToken();
  if (!token) throw new Error('Not authenticated');
  return apiClient.get<User>('/auth/me', {
    Authorization: `Bearer ${token}`,
  });
}
