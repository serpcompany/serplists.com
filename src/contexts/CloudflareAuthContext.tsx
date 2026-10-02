import React, { createContext, useCallback, useContext, useState, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { authClient } from '@/lib/auth-client';
import { getAuthErrorMessage, isEmailNotVerifiedError } from '@/lib/auth/authErrors';
import { EMAIL_VERIFIED_CALLBACK_URL } from '@/lib/auth/loginNotice';
import { keepGuardedWork } from '@/lib/navigation/leaveGuard';
import { isUserSwitch, removeSignedOutUserQueries } from '@/lib/queryKeys';
import {
  applySessionCheck,
  checkSessionWithRetry,
  classifySessionResult,
  createSignOutRunner,
  resolveSignInSession,
  signUpRequiresEmailVerification,
  type AuthActionResult,
  type SessionCheck,
  type SessionState,
  type SessionStatus,
  type SessionUser,
} from './authSession';
import { browserSessionSyncEnvironment, createSessionSync, startSessionKeepAlive } from './sessionSync';

const UNSAVED_WORK_LOST_MESSAGE = 'Your unsaved changes could not be kept.';

interface RegisterResult extends AuthActionResult {
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

type ConfirmedSessionCheck = Exclude<SessionCheck, { kind: 'unknown' }>;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const INITIAL_SESSION_STATE: SessionState = { user: null, session: null, status: 'loading' };

const readSession = async (): Promise<SessionCheck> => {
  try {
    return classifySessionResult(await authClient.getSession());
  } catch {
    return { kind: 'unknown' };
  }
};

function useRemovePreviousUserQueries(isLoading: boolean, userId: string | null) {
  const queryClient = useQueryClient();
  const settledUserIdRef = useRef<string | null>(null);
  useEffect(() => {
    if (isLoading) return;
    if (isUserSwitch(settledUserIdRef.current, userId)) {
      removeSignedOutUserQueries(queryClient);
    }
    settledUserIdRef.current = userId;
  }, [isLoading, queryClient, userId]);
}

function useRetryWhenBackOnline(sessionUnavailable: boolean, retry: () => void) {
  useEffect(() => {
    if (!sessionUnavailable) return;
    window.addEventListener('online', retry);
    return () => window.removeEventListener('online', retry);
  }, [retry, sessionUnavailable]);
}

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [state, setState] = useState<SessionState>(INITIAL_SESSION_STATE);
  const { user, session, status: sessionStatus } = state;
  const isLoading = sessionStatus === 'loading';
  const isAuthenticated = !!user;
  const sessionCheckInFlightRef = useRef(false);

  const [sessionSync] = useState(() =>
    createSessionSync({
      readSession,
      initialState: INITIAL_SESSION_STATE,
      setState,
      notify: (message) => toast(message),
      beforeSessionLost: () => {
        if (!keepGuardedWork()) toast.error(UNSAVED_WORK_LOST_MESSAGE);
      },
    }),
  );
  useEffect(() => {
    sessionSync.observe(state);
  }, [sessionSync, state]);
  useEffect(() => sessionSync.connect(browserSessionSyncEnvironment()), [sessionSync]);

  const applyConfirmedSession = useCallback(
    (check: ConfirmedSessionCheck, options: { announce?: boolean } = {}) => {
      sessionSync.claim();
      setState((current) => applySessionCheck(check, current));
      if (options.announce) sessionSync.announce(check.kind === 'authenticated' ? check.user.id : null);
    },
    [sessionSync],
  );

  useRemovePreviousUserQueries(isLoading, user?.id ?? null);

  const loadSession = useCallback(async () => {
    if (sessionCheckInFlightRef.current) return;
    sessionCheckInFlightRef.current = true;
    const ticket = sessionSync.beginRead();
    try {
      const check = await checkSessionWithRetry(() => authClient.getSession());
      if (!sessionSync.acceptRead(ticket)) return;
      setState((current) => applySessionCheck(check, current));
      if (check.kind !== 'unknown') sessionSync.announce(check.kind === 'authenticated' ? check.user.id : null);
    } finally {
      sessionCheckInFlightRef.current = false;
    }
  }, [sessionSync]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const retrySession = useCallback(() => {
    setState((current) => (current.user ? current : { ...current, status: 'loading' }));
    void loadSession();
  }, [loadSession]);

  useRetryWhenBackOnline(sessionStatus === 'unavailable', retrySession);

  useEffect(() => {
    if (!isAuthenticated) return undefined;
    return startSessionKeepAlive(sessionSync.keepAlive);
  }, [isAuthenticated, sessionSync]);

  const login = async (email: string, password: string): Promise<AuthActionResult> => {
    try {
      const result = await authClient.signIn.email({ email, password });
      if (result?.error) {
        const message = getAuthErrorMessage(result.error, "Login failed");
        if (isEmailNotVerifiedError(result.error)) {
          return { ok: false, error: message, errorCode: "EMAIL_NOT_VERIFIED" };
        }
        return { ok: false, error: message, errorCode: "UNKNOWN" };
      }

      const { sessionToStore, result: outcome } = await resolveSignInSession(result?.data, readSession);
      if (sessionToStore) {
        applyConfirmedSession(sessionToStore, { announce: true });
      }
      return outcome;
    } catch (error) {
      console.error('Login failed:', error);
      return { ok: false, error: "Login failed", errorCode: "UNKNOWN" };
    }
  };

  const register = async (
    name: string,
    email: string,
    password: string,
    callbackURL: string = EMAIL_VERIFIED_CALLBACK_URL,
  ): Promise<RegisterResult> => {
    try {
      const result = await authClient.signUp.email({ name, email, password, callbackURL });
      if (result?.error) {
        return { ok: false, error: getAuthErrorMessage(result.error, "Registration failed"), errorCode: "UNKNOWN" };
      }

      if (signUpRequiresEmailVerification(result?.data)) {
        return { ok: true, requiresEmailVerification: true };
      }

      const check = await readSession();
      if (check.kind === 'unknown') {
        retrySession();
      } else {
        applyConfirmedSession(check, { announce: true });
      }
      return { ok: true, requiresEmailVerification: false };
    } catch (error) {
      console.error('Registration failed:', error);
      return { ok: false, error: "Registration failed", errorCode: "UNKNOWN" };
    }
  };

  const [logout] = useState(() =>
    createSignOutRunner(
      () => authClient.signOut(),
      () => applyConfirmedSession({ kind: 'unauthenticated' }, { announce: true }),
    ),
  );

  const refreshProfile = async (): Promise<boolean> => {
    const check = await readSession();
    if (check.kind === 'unknown') {
      return false;
    }
    applyConfirmedSession(check);
    if (check.kind === 'authenticated') sessionSync.announceProfileChange(check.user.id);
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
