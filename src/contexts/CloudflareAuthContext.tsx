import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { authClient } from '@/lib/auth-client';
import { isUserSwitch, removeSignedOutUserQueries } from '@/lib/queryKeys';
import {
  applySessionCheck,
  checkSessionWithRetry,
  classifySessionResult,
  createSignOutRunner,
  signUpRequiresEmailVerification,
  type AuthActionResult,
  type SessionCheck,
  type SessionState,
  type SessionStatus,
  type SessionUser,
} from './authSession';

interface RegisterResult extends AuthActionResult {
  requiresEmailVerification?: boolean;
}

interface AuthContextType {
  user: SessionUser | null;
  session: unknown | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  // 'unavailable' means the session check failed (5xx, 429, network): the user may still be
  // signed in, so show a retry instead of sending them to /login (see authSession.ts).
  sessionStatus: SessionStatus;
  retrySession: () => void;
  login: (email: string, password: string) => Promise<AuthActionResult>;
  register: (name: string, email: string, password: string) => Promise<RegisterResult>;
  // Resolves { ok: false, error } and keeps the user signed in when the server did not sign
  // them out (rate limit, server error, network). Navigate away only on { ok: true }.
  logout: () => Promise<AuthActionResult>;
  // Resolves false when the session could not be read; the current user is kept.
  refreshProfile: () => Promise<boolean>;
}

type ConfirmedSessionCheck = Exclude<SessionCheck, { kind: 'unknown' }>;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const SESSION_UNCONFIRMED_MESSAGE =
  "Signed in, but your session could not be loaded. Check your connection and try again.";

const readSession = async (): Promise<SessionCheck> => {
  try {
    return classifySessionResult(await authClient.getSession());
  } catch {
    return { kind: 'unknown' };
  }
};

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>({ user: null, session: null, status: 'loading' });
  const { user, session, status: sessionStatus } = state;
  const isLoading = sessionStatus === 'loading';
  const isAuthenticated = !!user;
  const queryClient = useQueryClient();
  const settledUserIdRef = useRef<string | null>(null);
  // Bumped whenever sign-in, sign-out or a profile refresh sets the session, so a slower
  // session check started earlier cannot overwrite it.
  const sessionVersionRef = useRef(0);
  const sessionCheckInFlightRef = useRef(false);

  const applyConfirmedSession = useCallback((check: ConfirmedSessionCheck) => {
    sessionVersionRef.current += 1;
    setState((current) => applySessionCheck(check, current));
  }, []);

  // Sign-out and sign-in are SPA navigations, so the QueryClient outlives the session. When the
  // user changes, drop what the previous user loaded. This effect runs after its children's, so
  // by now every mounted query has moved to the new user's keys.
  useEffect(() => {
    if (isLoading) return;
    const nextUserId = user?.id ?? null;
    if (isUserSwitch(settledUserIdRef.current, nextUserId)) {
      removeSignedOutUserQueries(queryClient);
    }
    settledUserIdRef.current = nextUserId;
  }, [isLoading, queryClient, user?.id]);

  // Reads the session, retrying while the server cannot answer. A failed check never signs
  // anyone out: with no user yet it ends as 'unavailable'. One check runs at a time (StrictMode
  // mounts twice), and its answer is dropped if sign-in or sign-out set the session meanwhile.
  const loadSession = useCallback(async () => {
    if (sessionCheckInFlightRef.current) return;
    sessionCheckInFlightRef.current = true;
    const version = sessionVersionRef.current;
    try {
      const check = await checkSessionWithRetry(() => authClient.getSession());
      if (version !== sessionVersionRef.current) return;
      setState((current) => applySessionCheck(check, current));
    } finally {
      sessionCheckInFlightRef.current = false;
    }
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const retrySession = useCallback(() => {
    setState((current) => (current.user ? current : { ...current, status: 'loading' }));
    void loadSession();
  }, [loadSession]);

  // Try again as soon as the browser is back online.
  useEffect(() => {
    if (sessionStatus !== 'unavailable') return;
    window.addEventListener('online', retrySession);
    return () => window.removeEventListener('online', retrySession);
  }, [retrySession, sessionStatus]);

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

      const immediate = classifySessionResult(result);
      const check = immediate.kind === 'authenticated' ? immediate : await readSession();
      if (check.kind === 'unknown') {
        // The sign-in worked; only reading the session failed. Keep the current state.
        return { ok: false, error: SESSION_UNCONFIRMED_MESSAGE, errorCode: "UNKNOWN" };
      }
      applyConfirmedSession(check);
      return check.kind === 'authenticated'
        ? { ok: true }
        : { ok: false, error: "Unable to establish session", errorCode: "UNKNOWN" };
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

      // The server says whether the account must verify its email: no session token.
      if (signUpRequiresEmailVerification(result?.data)) {
        return { ok: true, requiresEmailVerification: true };
      }

      const check = await readSession();
      if (check.kind === 'unknown') {
        // Signed up and signed in, but the session could not be read yet: load it again.
        retrySession();
      } else {
        applyConfirmedSession(check);
      }
      return { ok: true, requiresEmailVerification: false };
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, error: "Registration failed", errorCode: "UNKNOWN" };
    }
  };

  const signOutRef = useRef<(() => Promise<AuthActionResult>) | null>(null);
  signOutRef.current ??= createSignOutRunner(
    () => authClient.signOut(),
    () => applyConfirmedSession({ kind: 'unauthenticated' }),
  );
  const logout = signOutRef.current;

  const refreshProfile = async (): Promise<boolean> => {
    const check = await readSession();
    if (check.kind === 'unknown') {
      // Keep the signed-in user: the save that asked for this refresh already succeeded.
      return false;
    }
    applyConfirmedSession(check);
    return check.kind === 'authenticated';
  };

  return (
    <AuthContext.Provider value={{
      user,
      session,
      isAuthenticated,
      isLoading,
      sessionStatus,
      retrySession,
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
