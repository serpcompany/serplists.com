type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

/**
 * Under the production auth policy (AUTH_EMAIL_VERIFICATION_REQUIRED=true),
 * Better Auth checks new passwords against Have I Been Pwned. Answer those range
 * lookups with "not found" and pass every other request (the email provider) on.
 */
export function answeringPwnedPasswords(next: Fetch): Fetch {
  return async (input, init) => {
    if (String(input).startsWith('https://api.pwnedpasswords.com/')) {
      return new Response('', { status: 200 });
    }
    return next(input, init);
  };
}
