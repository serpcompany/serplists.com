import { buildAuthLinkState, withReturnPath } from "@/lib/auth/returnPath";

/**
 * Ends the session on the server, then clears it in the app. Resolves only
 * after both and never rejects: a failed server call still signs the user out
 * here, so a caller can navigate as soon as it resolves.
 */
export async function endSession(
  signOut: () => Promise<unknown>,
  clearLocalSession: () => void,
): Promise<void> {
  try {
    await signOut();
  } catch (error) {
    console.error("Sign out failed:", error);
  } finally {
    clearLocalSession();
  }
}

type NavigateToLogin = (to: string, options: { state?: { from: string } }) => void;

/**
 * Signs out, then opens the login page with a way back to `returnPath` (on
 * the Sign up link too). The navigation waits for sign-out: while the old
 * session is still set, the login page sends a signed-in visitor straight back
 * to `returnPath` as the old account.
 */
export async function signOutAndReturn({
  logout,
  navigate,
  returnPath,
}: {
  logout: () => Promise<void>;
  navigate: NavigateToLogin;
  returnPath: string;
}): Promise<void> {
  await logout();
  navigate(withReturnPath("/login", returnPath), { state: buildAuthLinkState(returnPath) });
}
