// A password reset email lands on /reset-password?token=... The page reads the token
// once and then removes it from the address bar and history, so it does not linger where
// the browser, extensions or analytics tags can read it.

export interface ResetPasswordLink {
  token: string | null;
  error: string | null;
  /** The search to replace the URL with when it still carries a token. */
  searchWithoutToken: string | null;
}

const isTokenKey = (key: string) => key.toLowerCase() === 'token';

export function readResetPasswordLink(search: string): ResetPasswordLink {
  const params = new URLSearchParams(search);
  const token = params.get('token') || null;
  const error = params.get('error') || null;

  const tokenKeys = [...params.keys()].filter(isTokenKey);
  let searchWithoutToken: string | null = null;
  if (tokenKeys.length > 0) {
    tokenKeys.forEach((key) => params.delete(key));
    const remaining = params.toString();
    searchWithoutToken = remaining ? `?${remaining}` : '';
  }

  return { token, error, searchWithoutToken };
}
