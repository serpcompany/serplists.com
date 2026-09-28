import { describe, expect, it } from 'vitest';

import {
  buildEmailVerifiedCallbackURL,
  EMAIL_VERIFIED_CALLBACK_URL,
  getLoginNotice,
  parseLoginSearch,
  stripLoginNoticeParams,
} from '@/lib/auth/loginNotice';

describe('getLoginNotice', () => {
  it.each([
    ['?verified=1&error=token_expired', 'token_expired'],
    ['?verified=1&error=invalid_token', 'invalid_token'],
    ['?verified=1&error=user_not_found', 'user_not_found'],
    ['?verified=1&error=weird', 'unknown'],
    ['?error=token_expired', 'token_expired'],
    ['?verified=1&error=', 'unknown'],
  ])('treats %s as a failed verification link', (search, reason) => {
    const notice = getLoginNotice(search);
    expect(notice?.kind).toBe('verification_failed');
    expect(notice).toMatchObject({ reason });
  });

  it('explains that an expired link can be replaced', () => {
    expect(getLoginNotice('?verified=1&error=token_expired')?.message).toMatch(/expired/i);
  });

  it('does not treat the change-email error shape as success', () => {
    expect(getLoginNotice('?verified=1?error=unauthorized')?.kind).not.toBe('verified');
  });

  it('reports success only for verified=1 without an error', () => {
    expect(getLoginNotice('?verified=1')).toEqual({
      kind: 'verified',
      message: 'Email verified. You can sign in now.',
    });
  });

  it('asks new accounts to verify first', () => {
    expect(getLoginNotice('?verify_email=1&email=a%40b.co')?.kind).toBe('verify_email');
  });

  it('returns null without notice parameters', () => {
    expect(getLoginNotice('')).toBeNull();
    expect(getLoginNotice('?foo=bar')).toBeNull();
  });
});

describe('parseLoginSearch', () => {
  it('returns the prefilled email', () => {
    expect(parseLoginSearch('?verify_email=1&email=a%40b.co')).toEqual({
      notice: { kind: 'verify_email', message: 'Verify your email first, then sign in.' },
      email: 'a@b.co',
    });
  });

  it('ignores a blank email', () => {
    expect(parseLoginSearch('?email=%20').email).toBeNull();
  });
});

describe('stripLoginNoticeParams', () => {
  it('removes the one-shot parameters and keeps the rest', () => {
    expect(stripLoginNoticeParams('?verified=1&error=token_expired&foo=bar')).toBe('?foo=bar');
    expect(stripLoginNoticeParams('?verify_email=1&email=a%40b.co')).toBe('');
  });

  it('returns null when there is nothing to remove', () => {
    expect(stripLoginNoticeParams('')).toBeNull();
    expect(stripLoginNoticeParams('?foo=bar')).toBeNull();
  });
});

describe('EMAIL_VERIFIED_CALLBACK_URL', () => {
  it('carries exactly one query parameter so the unencoded email link keeps it whole', () => {
    const [, query = ''] = EMAIL_VERIFIED_CALLBACK_URL.split('?');
    expect(EMAIL_VERIFIED_CALLBACK_URL.startsWith('/login?')).toBe(true);
    expect(query).not.toContain('&');
    expect(getLoginNotice(`?${query}`)?.kind).toBe('verified');
  });
});

describe('buildEmailVerifiedCallbackURL', () => {
  it('is the plain callback without a return path', () => {
    expect(buildEmailVerifiedCallbackURL(null)).toBe(EMAIL_VERIFIED_CALLBACK_URL);
  });

  it('hides the next parameter from the unencoded email link and restores it after one decode', () => {
    const callbackURL = buildEmailVerifiedCallbackURL('/team-invites/abc?x=1#h');

    expect(callbackURL).not.toMatch(/[&#]/);
    // What /verify-email reads back out of the email link, and redirects to.
    const redirect = decodeURIComponent(callbackURL);
    expect(redirect).toBe('/login?verified=1&next=%2Fteam-invites%2Fabc%3Fx%3D1%23h');
  });

  it("encodes the characters Better Auth's callback check rejects", () => {
    expect(buildEmailVerifiedCallbackURL("/t/(v2)!~*'")).toMatch(/^\/login\?[\w\-.+/=&%@]*$/);
  });
});
