import { SIGN_OUT_FAILED_MESSAGE, type AuthActionResult } from '@/contexts/authSession';
import { withReturnPath } from '@/lib/auth/returnPath';
import { buildLoginPath } from '@/lib/routes';

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
