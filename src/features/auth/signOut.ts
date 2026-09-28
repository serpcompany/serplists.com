import { SIGN_OUT_FAILED_MESSAGE, type AuthActionResult } from '@/contexts/authSession';

// The account menus call this: leave the page only once the server has ended the session,
// otherwise keep the user where they are and show why sign-out failed.
export async function signOutAndLeave(options: {
  logout: () => Promise<AuthActionResult>;
  onSignedOut: () => void;
  onError: (message: string) => void;
}): Promise<boolean> {
  const result = await options.logout();
  if (result.ok) {
    options.onSignedOut();
    return true;
  }
  options.onError(result.error ?? SIGN_OUT_FAILED_MESSAGE);
  return false;
}
