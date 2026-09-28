import { getAuthErrorMessage } from './authErrors';

export type PasswordResetResult = { ok: true } | { ok: false; message: string };

/**
 * Sets the new password. A successful reset revokes every session for the
 * account on the server, including one in this browser, so a signed-in visitor
 * also drops the stale local user; otherwise /login would bounce them to a
 * dashboard whose requests all return 401.
 */
export async function submitPasswordReset(params: {
  resetPassword: () => Promise<{ error?: { message?: string } | null } | null | undefined>;
  signOutLocally: () => Promise<void>;
  isSignedIn: boolean;
}): Promise<PasswordResetResult> {
  try {
    const result = await params.resetPassword();
    if (result?.error) {
      return { ok: false, message: getAuthErrorMessage(result.error, 'Unable to reset password') };
    }
  } catch {
    return { ok: false, message: 'Unable to reset password' };
  }

  if (params.isSignedIn) {
    try {
      await params.signOutLocally();
    } catch {
      // The server already revoked the session; the password change stands.
    }
  }
  return { ok: true };
}
