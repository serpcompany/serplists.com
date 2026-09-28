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
import { browserSessionSyncEnvironment, createSessionSync } from './sessionSync';

/** How often a visible, signed-in tab asks whether its session keep-alive read is due. */
const SESSION_KEEPALIVE_TICK_MS = 15 * 60 * 1000;

const UNSAVED_WORK_LOST_MESSAGE = 'Your unsaved changes could not be kept.';

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
  register: (
    name: string,
    email: string,
    password: string,
    callbackURL?: string,
  ) => Promise<RegisterResult>;
  // Resolves { ok: false, error } and keeps the user signed in when the server did not sign
  // them out (rate limit, server error, network). Navigate away only on { ok: true }.
  logout: () => Promise<AuthActionResult>;
  // Resolves false when the session could not be read; the current user is kept.
  refreshProfile: () => Promise<boolean>;
}

type ConfirmedSessionCheck = Exclude<SessionCheck, { kind: 'unknown' }>;

const AuthContext = createContext<AuthContextType | undefined>(undefined);

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
  const sessionCheckInFlightRef = useRef(false);
  const stateRef = useRef(state);
  useEffect(() => {
    stateRef.current = state;
  }, [state]);

  // Follows sign-ins and sign-outs in other tabs, which share this tab's session cookie, and
  // orders session answers so a slower check started earlier cannot overwrite a newer one
  // (see sessionSync.ts). Before a background change unmounts the signed-in pages, pages
  // with unsaved work keep it on this tab to offer it back after sign-in.
  const [sessionSync] = useState(() =>
    createSessionSync({
      readSession,
      getState: () => stateRef.current,
      setState,
      notify: (message) => toast(message),
      beforeSessionLost: () => {
        if (!keepGuardedWork()) toast.error(UNSAVED_WORK_LOST_MESSAGE);
      },
    }),
  );
  useEffect(() => sessionSync.connect(browserSessionSyncEnvironment()), [sessionSync]);

  // Sign-in, sign-out and profile refreshes in this tab. Sign-in and sign-out are announced to
  // the other tabs.
  const applyConfirmedSession = useCallback(
    (check: ConfirmedSessionCheck, options: { announce?: boolean } = {}) => {
      sessionSync.claim();
      setState((current) => applySessionCheck(check, current));
      if (options.announce) sessionSync.announce(check.kind === 'authenticated' ? check.user.id : null);
    },
    [sessionSync],
  );

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
  // mounts twice), and its answer is dropped if a newer answer, a sign-in or a sign-out set the
  // session meanwhile. A confirmed answer is announced, so tabs that still show another user
  // (for example after an email verification link signed this one in) re-check.
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

  // Try again as soon as the browser is back online.
  useEffect(() => {
    if (sessionStatus !== 'unavailable') return;
    window.addEventListener('online', retrySession);
    return () => window.removeEventListener('online', retrySession);
  }, [retrySession, sessionStatus]);

  // Only GET /api/auth/get-session extends a session and resends its cookie, so a signed-in
  // tab that stays open reads it when it regains focus and on a timer while it is visible;
  // keepAlive reads it at most once an hour (see sessionSync.ts). The answer is applied like
  // any re-check: a failure changes nothing, and a confirmed "no session" signs the tab out.
  useEffect(() => {
    if (!isAuthenticated) return;
    const keepAliveIfVisible = () => {
      if (document.visibilityState === 'visible') sessionSync.keepAlive();
    };
    window.addEventListener('focus', keepAliveIfVisible);
    const tick = window.setInterval(keepAliveIfVisible, SESSION_KEEPALIVE_TICK_MS);
    return () => {
      window.removeEventListener('focus', keepAliveIfVisible);
      window.clearInterval(tick);
    };
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

      // The sign-in response's user has no username: store the session's user instead, set
      // once so the Login page never navigates with the partial one.
      const { check, result: outcome } = await resolveSignInSession(result?.data, readSession);
      if (check) {
        applyConfirmedSession(check, { announce: true });
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

      // The server says whether the account must verify its email: no session token.
      if (signUpRequiresEmailVerification(result?.data)) {
        return { ok: true, requiresEmailVerification: true };
      }

      const check = await readSession();
      if (check.kind === 'unknown') {
        // Signed up and signed in, but the session could not be read yet: load it again.
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

  const signOutRef = useRef<(() => Promise<AuthActionResult>) | null>(null);
  signOutRef.current ??= createSignOutRunner(
    () => authClient.signOut(),
    () => applyConfirmedSession({ kind: 'unauthenticated' }, { announce: true }),
  );
  const logout = signOutRef.current;

  const refreshProfile = async (): Promise<boolean> => {
    const check = await readSession();
    if (check.kind === 'unknown') {
      // Keep the signed-in user: the save that asked for this refresh already succeeded.
      return false;
    }
    applyConfirmedSession(check);
    // Other tabs showing this user re-read the session, so they show the new name,
    // username or avatar (and build links from the new username).
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
