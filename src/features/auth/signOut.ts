import { SIGN_OUT_FAILED_MESSAGE, type AuthActionResult } from '@/contexts/authSession';
import { withReturnPath } from '@/lib/auth/returnPath';
import { buildLoginPath } from '@/lib/routes';

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

type NavigateToLogin = (href: string) => unknown;

/**
 * Signs out, then opens the login page with a way back to `returnPath` (on
 * the Sign up link too). The navigation waits for sign-out: while the old
 * session is still set, the login page sends a signed-in visitor straight back
 * to `returnPath` as the old account. A sign-out the server refused keeps the
 * user on the page and reports the error.
 */
export function signOutAndReturn({
  logout,
  navigate,
  returnPath,
  onError,
}: {
  logout: () => Promise<AuthActionResult>;
  navigate: NavigateToLogin;
  returnPath: string;
  onError: (message: string) => void;
}): Promise<boolean> {
  return signOutAndLeave({
    logout,
    onSignedOut: () => {
      navigate(withReturnPath(buildLoginPath(), returnPath));
    },
    onError,
  });
}
