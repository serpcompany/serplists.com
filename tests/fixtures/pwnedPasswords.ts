type Fetch = (input: string, init?: RequestInit) => Promise<Response>;

const PWNED_PASSWORDS_RANGE_API = 'https://api.pwnedpasswords.com/';

const rangeWithNoBreachedPassword = () => new Response('', { status: 200 });

export function answeringPwnedPasswordRangesAsNotFound(everyOtherRequest: Fetch): Fetch {
  return async (input, init) => {
    if (String(input).startsWith(PWNED_PASSWORDS_RANGE_API)) {
      return rangeWithNoBreachedPassword();
    }
    return everyOtherRequest(input, init);
  };
}
