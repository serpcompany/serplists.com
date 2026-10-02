import { createContext, useContext } from 'react';

import type { AuthActionResult, SessionStatus, SessionUser } from './authSession';

export interface RegisterResult extends AuthActionResult {
  requiresEmailVerification?: boolean;
}

interface AuthContextType {
  user: SessionUser | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  sessionStatus: SessionStatus;
  retrySession: () => void;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (
    name: string,
    email: string,
    password: string,
    callbackURL?: string,
  ) => Promise<RegisterResult>;
  logout: () => Promise<AuthActionResult>;
  refreshProfile: () => Promise<boolean>;
}

export const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
