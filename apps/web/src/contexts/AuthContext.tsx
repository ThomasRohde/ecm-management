import {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  type ReactNode,
} from 'react';
import type { User, UserRole } from '@ecm/shared';
import {
  login as apiLogin,
  register as apiRegister,
  getMe,
  clearAuth as apiClearAuth,
  getStoredToken,
  getStoredUser,
} from '../api/auth';
import {
  syncAuthToIdentity,
  clearAuthFromIdentity,
} from '../api/identity';

export interface AuthContextValue {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (email: string, displayName: string, password: string, role?: UserRole) => Promise<void>;
  logout: () => void;
  refreshUser: () => Promise<void>;
  hasRole: (role: UserRole) => boolean;
  hasAnyRole: (roles: UserRole[]) => boolean;
}

const AuthContext = createContext<AuthContextValue | undefined>(undefined);

export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}

interface AuthProviderProps {
  children: ReactNode;
}

export function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);

  const syncUser = useCallback((newUser: User | null) => {
    setUser(newUser);
    if (newUser) {
      syncAuthToIdentity(newUser);
    } else {
      clearAuthFromIdentity();
    }
  }, []);

  const initializeAuth = useCallback(async () => {
    const token = getStoredToken();
    if (!token) {
      setIsLoading(false);
      return;
    }

    const storedUser = getStoredUser();
    if (storedUser) {
      syncUser(storedUser);
    }

    try {
      const currentUser = await getMe();
      syncUser(currentUser);
    } catch (error) {
      console.warn('Token validation failed, clearing auth:', error);
      apiClearAuth();
      clearAuthFromIdentity();
      setUser(null);
    } finally {
      setIsLoading(false);
    }
  }, [syncUser]);

  useEffect(() => {
    void initializeAuth();
  }, [initializeAuth]);

  const login = useCallback(async (email: string, password: string) => {
    const response = await apiLogin(email, password);
    syncUser(response.user);
  }, [syncUser]);

  const register = useCallback(async (
    email: string,
    displayName: string,
    password: string,
    role?: UserRole,
  ) => {
    const response = await apiRegister(email, displayName, password, role);
    syncUser(response.user);
  }, [syncUser]);

  const logout = useCallback(() => {
    apiClearAuth();
    syncUser(null);
  }, [syncUser]);

  const refreshUser = useCallback(async () => {
    const currentUser = await getMe();
    syncUser(currentUser);
  }, [syncUser]);

  const hasRole = useCallback((role: UserRole): boolean => {
    return user?.role === role;
  }, [user]);

  const hasAnyRole = useCallback((roles: UserRole[]): boolean => {
    return user ? roles.includes(user.role) : false;
  }, [user]);

  const value: AuthContextValue = {
    user,
    isAuthenticated: !!user,
    isLoading,
    login,
    register,
    logout,
    refreshUser,
    hasRole,
    hasAnyRole,
  };

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
