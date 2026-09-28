import { describe, expect, it } from 'vitest';

import { isSensitiveAnalyticsLocation } from '@/lib/analyticsUrl';
import { buildVerifyEmailLoginRedirect, readLoginPrefill } from '@/lib/auth/loginPrefill';

describe('buildVerifyEmailLoginRedirect', () => {
  it('keeps the new account email out of the login URL', () => {
    const redirect = buildVerifyEmailLoginRedirect('alice+new@example.com');
    const url = new URL(redirect.to, 'https://serplists.com');

    expect(url.searchParams.has('email')).toBe(false);
    expect(redirect.to).not.toContain('alice');
    expect(url.pathname).toBe('/login');
    expect(url.searchParams.get('verify_email')).toBe('1');
    expect(redirect.state).toEqual({ email: 'alice+new@example.com' });
    expect(isSensitiveAnalyticsLocation(url.pathname, url.search)).toBe(false);
  });
});

describe('readLoginPrefill', () => {
  it('prefills the email from router state after sign-up', () => {
    expect(readLoginPrefill('?verify_email=1', { email: 'alice@example.com' })).toEqual({
      email: 'alice@example.com',
      searchWithoutEmail: null,
    });
  });

  it('still reads old links that carry the email in the URL, and asks for it to be removed', () => {
    expect(readLoginPrefill('?verify_email=1&email=alice%40example.com', null)).toEqual({
      email: 'alice@example.com',
      searchWithoutEmail: '?verify_email=1',
    });
    expect(readLoginPrefill('?email=a%40b.c', { from: { pathname: '/account' } })).toMatchObject({
      email: 'a@b.c',
      searchWithoutEmail: '',
    });
  });

  it('removes email parameters in any letter case', () => {
    expect(readLoginPrefill('?Email=a%40b.c&verified=1', null)).toMatchObject({
      searchWithoutEmail: '?verified=1',
    });
  });

  it('ignores state that is not an email prefill', () => {
    expect(readLoginPrefill('', { from: { pathname: '/team-invites/x' } }).email).toBeNull();
    expect(readLoginPrefill('', { email: 42 }).email).toBeNull();
    expect(readLoginPrefill('', { email: '   ' }).email).toBeNull();
    expect(readLoginPrefill('?email=%20', null).email).toBeNull();
    expect(readLoginPrefill('', undefined)).toEqual({
      email: null,
      searchWithoutEmail: null,
    });
  });
});
