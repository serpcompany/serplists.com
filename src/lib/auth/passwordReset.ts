import { getAuthErrorMessage } from './authErrors';

export type PasswordResetResult = { ok: true } | { ok: false; message: string };

export async function submitPasswordReset(params: {
  resetPassword: () => Promise<{ error?: { message?: string } | null } | null | undefined>;
  signOutLocally: () => Promise<unknown>;
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
    await params.signOutLocally().catch(() => undefined);
  }
  return { ok: true };
}
