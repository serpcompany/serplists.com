import { z } from 'zod';

import { getSessionStorage } from '@/lib/browserStorage';

// Sign-up sends a new account to the login page to verify its email. The address never goes
// in the URL: tags that read location.href (see src/lib/analyticsUrl.ts) would otherwise
// record it on the client-side navigation. Sign-up leaves it in sessionStorage for the login
// page, which takes it once and keeps it in its own history entry's state, so a reload of
// that entry still fills the form and a later visit to /login does not.

export const VERIFY_EMAIL_LOGIN_PATH = '/login?verify_email=1';

const HANDOFF_STORAGE_KEY = 'serplists:login-email';

const loginStateSchema = z.object({ email: z.string().trim().min(1) });

type HandoffStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>;

/** Sign-up: leaves the address for the login page. Blocked storage leaves the form empty. */
export function handOffLoginEmail(
  email: string,
  storage: HandoffStorage | undefined = getSessionStorage(),
): void {
  try {
    storage?.setItem(HANDOFF_STORAGE_KEY, email);
  } catch {
    // Full or blocked: the login page starts with an empty email field.
  }
}

/** Login: the address sign-up left, still there (the page reads it while rendering). */
export function peekHandedOffLoginEmail(
  storage: Pick<HandoffStorage, 'getItem'> | undefined = getSessionStorage(),
): string | null {
  try {
    return storage?.getItem(HANDOFF_STORAGE_KEY)?.trim() || null;
  } catch {
    return null;
  }
}

/** Login: the address sign-up left, removed so it fills the form only once. */
export function takeHandedOffLoginEmail(
  storage: HandoffStorage | undefined = getSessionStorage(),
): string | null {
  try {
    const email = storage?.getItem(HANDOFF_STORAGE_KEY)?.trim() || null;
    storage?.removeItem(HANDOFF_STORAGE_KEY);
    return email;
  } catch {
    return null;
  }
}

/** The history entry state the login page keeps the address in. */
export const buildKeptLoginState = (email: string): { email: string } => ({ email });

/** The address kept in the login page's history entry state, if any. */
export function readKeptLoginEmail(historyState: unknown): string | null {
  const parsed = loginStateSchema.safeParse(historyState);
  return parsed.success ? parsed.data.email : null;
}

// The notices that /login shows from its query come from src/lib/auth/loginNotice.ts.
export interface LoginPrefill {
  email: string | null;
  /** The search to replace the URL with when it still carries an email address. */
  searchWithoutEmail: string | null;
}

const isEmailKey = (key: string) => key.toLowerCase() === 'email';

/**
 * The address to fill in: the one sign-up handed over or this entry kept, else one from a
 * link sent before the address left the URL (`?email=`), which the page then removes.
 */
export function readLoginPrefill(search: string, keptEmail: string | null): LoginPrefill {
  const params = new URLSearchParams(search);
  const legacyEmail = params.get('email')?.trim() || null;

  const emailKeys = [...params.keys()].filter(isEmailKey);
  let searchWithoutEmail: string | null = null;
  if (emailKeys.length > 0) {
    emailKeys.forEach((key) => params.delete(key));
    const remaining = params.toString();
    searchWithoutEmail = remaining ? `?${remaining}` : '';
  }

  return {
    email: keptEmail?.trim() || legacyEmail,
    searchWithoutEmail,
  };
}
