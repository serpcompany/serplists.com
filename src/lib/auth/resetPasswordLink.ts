export interface ResetPasswordLink {
  token: string | null;
  error: string | null;
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
