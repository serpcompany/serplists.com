import React, { createContext, useCallback, useContext, useState, useEffect } from 'react';
import { authClient } from '@/lib/auth-client';
import {
  checkSessionWithRetry,
  classifySessionResult,
  createSessionRechecker,
  isSameSessionUser,
  type SessionCheck,
  type SessionUser,
} from '@/lib/auth/sessionCheck';

/** How often a visible tab asks the throttled re-check whether it is due. */
const SESSION_RECHECK_TICK_MS = 15 * 60 * 1000;

type User = SessionUser;

type AuthErrorCode = "EMAIL_NOT_VERIFIED" | "UNKNOWN";

interface AuthActionResult {
  ok: boolean;
  error?: string;
  errorCode?: AuthErrorCode;
}

interface RegisterResult extends AuthActionResult {
  requiresEmailVerification?: boolean;
}

interface AuthContextType {
  user: User | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  /** The first session check never got a definite answer (rate limit, server or network error). */
  sessionUnavailable: boolean;
  retrySessionCheck: () => void;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  logout: () => Promise<void>;
  refreshProfile: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [session, setSession] = useState<unknown | null>(null);
  const [sessionUnavailable, setSessionUnavailable] = useState(false);
  const [sessionCheckAttempt, setSessionCheckAttempt] = useState(0);

  const isAuthenticated = !!user;

  /**
   * Applies a definite answer. An unknown answer (429, 5xx, network error)
   * leaves the current user in place so a signed-in user is never logged out
   * by a transient failure.
   */
  const applySessionCheck = useCallback((outcome: SessionCheck) => {
    if (outcome.kind === 'authenticated') {
      setUser((current) => (isSameSessionUser(current, outcome.user) ? current : outcome.user));
      setSession(outcome.session);
    } else if (outcome.kind === 'anonymous') {
      setUser(null);
      setSession(null);
    }
  }, []);

  useEffect(() => {
    let cancelled = false;
    checkSessionWithRetry(() => authClient.getSession(), { isCancelled: () => cancelled }).then((outcome) => {
      if (cancelled) return;
      applySessionCheck(outcome);
      setSessionUnavailable(outcome.kind === 'unknown');
      setIsLoading(false);
    });
    return () => {
      cancelled = true;
    };
  }, [applySessionCheck, sessionCheckAttempt]);

  // Only GET /api/auth/get-session extends a session and resends its cookie, so
  // a signed-in tab re-checks it (throttled) when it regains focus and while it
  // stays visible. A definite "no session" signs the user out; errors do not.
  useEffect(() => {
    if (!isAuthenticated) return;
    let active = true;
    const recheck = createSessionRechecker({
      getSession: () => authClient.getSession(),
      onResult: (outcome) => {
        if (active) applySessionCheck(outcome);
      },
    });
    const recheckIfVisible = () => {
      if (document.visibilityState === 'visible') void recheck();
    };
    document.addEventListener('visibilitychange', recheckIfVisible);
    window.addEventListener('focus', recheckIfVisible);
    const tick = window.setInterval(recheckIfVisible, SESSION_RECHECK_TICK_MS);
    return () => {
      active = false;
      document.removeEventListener('visibilitychange', recheckIfVisible);
      window.removeEventListener('focus', recheckIfVisible);
      window.clearInterval(tick);
    };
  }, [isAuthenticated, applySessionCheck]);

  const retrySessionCheck = useCallback(() => {
    setSessionUnavailable(false);
    setIsLoading(true);
    setSessionCheckAttempt((attempt) => attempt + 1);
  }, []);

  const login = async (email: string, password: string): Promise<AuthActionResult> => {
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) {
        const message = result.error.message ?? "Login failed";
        if (message.toLowerCase().includes("email not verified")) {
          return { ok: false, error: message, errorCode: "EMAIL_NOT_VERIFIED" };
        }
        return { ok: false, error: message, errorCode: "UNKNOWN" };
      }

      const immediateUser = result?.data?.user;
      if (immediateUser) {
        setUser(immediateUser as unknown as User);
        setSession(result.data);
        setSessionUnavailable(false);
        return { ok: true };
      }

      const nextSession = classifySessionResult(await authClient.getSession());
      applySessionCheck(nextSession);
      if (nextSession.kind === 'authenticated') {
        setSessionUnavailable(false);
        return { ok: true };
      }
      return { ok: false, error: "Unable to establish session", errorCode: "UNKNOWN" };
    } catch (error) {
      console.error('Login failed:', error);
      return { ok: false, error: "Login failed", errorCode: "UNKNOWN" };
    }
  };

  const register = async (name: string, email: string, password: string): Promise<RegisterResult> => {
    try {
      const callbackURL = "/login?verified=1";
      const result = await authClient.signUp.email({ name, email, password, callbackURL });
      if (result?.error) {
        return { ok: false, error: result.error.message ?? "Registration failed", errorCode: "UNKNOWN" };
      }

      const nextSession = await authClient.getSession();
      if (nextSession?.data?.user) {
        setUser(nextSession.data.user as unknown as User);
        setSession(nextSession.data);
        return { ok: true, requiresEmailVerification: false };
      }

      return { ok: true, requiresEmailVerification: true };
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, error: "Registration failed", errorCode: "UNKNOWN" };
    }
  };

  /** Resolves once the local user is cleared, whether or not the server call succeeded. */
  const logout = async () => {
    try {
      await authClient.signOut();
    } catch (error) {
      console.error('Sign out failed:', error);
    } finally {
      setUser(null);
      setSession(null);
    }
  };

  const refreshProfile = async () => {
    try {
      applySessionCheck(classifySessionResult(await authClient.getSession()));
    } catch (error) {
      console.error('Failed to refresh session:', error);
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAuthenticated,
      isLoading,
      sessionUnavailable,
      retrySessionCheck,
      login,
      register,
      logout,
      refreshProfile
    }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
