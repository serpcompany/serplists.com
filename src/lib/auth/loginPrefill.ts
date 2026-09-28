import { z } from 'zod';

// Sign-up sends a new account to the login page to verify its email. The address travels
// in router state, never in the URL: tags that read location.href (see
// src/lib/analyticsUrl.ts) would otherwise record it on the client-side navigation.

const VERIFY_EMAIL_LOGIN_PATH = '/login?verify_email=1';

const loginStateSchema = z.object({ email: z.string().trim().min(1) });

export interface VerifyEmailLoginRedirect {
  to: string;
  state: { email: string };
}

export const buildVerifyEmailLoginRedirect = (email: string): VerifyEmailLoginRedirect => ({
  to: VERIFY_EMAIL_LOGIN_PATH,
  state: { email },
});

// The notices that /login shows from its query come from src/lib/auth/loginNotice.ts.
export interface LoginPrefill {
  email: string | null;
  /** The search to replace the URL with when it still carries an email address. */
  searchWithoutEmail: string | null;
}

const isEmailKey = (key: string) => key.toLowerCase() === 'email';

export function readLoginPrefill(search: string, state: unknown): LoginPrefill {
  const params = new URLSearchParams(search);
  const parsedState = loginStateSchema.safeParse(state);
  // Links from before the address moved into router state still work.
  const legacyEmail = params.get('email')?.trim() || null;

  const emailKeys = [...params.keys()].filter(isEmailKey);
  let searchWithoutEmail: string | null = null;
  if (emailKeys.length > 0) {
    emailKeys.forEach((key) => params.delete(key));
    const remaining = params.toString();
    searchWithoutEmail = remaining ? `?${remaining}` : '';
  }

  return {
    email: parsedState.success ? parsedState.data.email : legacyEmail,
    searchWithoutEmail,
  };
}
