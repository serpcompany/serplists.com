import { describe, expect, it } from 'vitest';

import {
  buildAuthLinkState,
  getPostRegisterDestination,
  getReturnPath,
  sanitizeReturnPath,
  withReturnPath,
} from '@/lib/auth/returnPath';

describe('sanitizeReturnPath', () => {
  it('keeps the path, query, and hash of an in-app path', () => {
    expect(sanitizeReturnPath('/team-invites/abc?x=1#h')).toBe('/team-invites/abc?x=1#h');
    expect(sanitizeReturnPath('/dashboard/settings?billing=cancel#plan')).toBe(
      '/dashboard/settings?billing=cancel#plan',
    );
  });

  it('keeps percent-encoding as it is instead of decoding it', () => {
    expect(sanitizeReturnPath('/team-invites/a%2Fb')).toBe('/team-invites/a%2Fb');
  });

  it.each([
    '//evil.com',
    '/\\evil.com',
    '/foo\\bar',
    'https://evil.com',
    'javascript:alert(1)',
    'dashboard',
    '',
    '/foo\nbar',
    '/%0a',
  ])('rejects %j', (value) => {
    expect(sanitizeReturnPath(value)).toBeNull();
  });

  it.each(['/login', '/login?verified=1', '/register', '/forgot-password', '/reset-password/', '/LOGIN'])(
    'rejects the auth page %s so sign-in cannot loop',
    (value) => {
      expect(sanitizeReturnPath(value)).toBeNull();
    },
  );

  it('rejects non-strings', () => {
    expect(sanitizeReturnPath(undefined)).toBeNull();
    expect(sanitizeReturnPath(null)).toBeNull();
    expect(sanitizeReturnPath({ pathname: '/x' })).toBeNull();
  });
});

describe('getReturnPath', () => {
  it('reads pathname, search, and hash from router state', () => {
    expect(
      getReturnPath({
        state: { from: { pathname: '/team-invites/abc', search: '?x=1', hash: '#h' } },
        search: '',
      }),
    ).toBe('/team-invites/abc?x=1#h');
  });

  it('accepts a string return path in state', () => {
    expect(getReturnPath({ state: { from: '/team-invites/abc' }, search: '' })).toBe('/team-invites/abc');
  });

  it('prefers state over the next parameter', () => {
    expect(
      getReturnPath({ state: { from: { pathname: '/a' } }, search: '?next=%2Fb' }),
    ).toBe('/a');
  });

  it('falls back to the next parameter, which survives the email round trip', () => {
    expect(getReturnPath({ state: null, search: '?verified=1&next=%2Fteam-invites%2Fabc%3Fx%3D1%23h' })).toBe(
      '/team-invites/abc?x=1#h',
    );
  });

  it('ignores unsafe values in either source', () => {
    expect(getReturnPath({ state: { from: { pathname: '//evil.com' } }, search: '?next=https%3A%2F%2Fevil.com' })).toBeNull();
    expect(getReturnPath({ state: 'nope', search: '' })).toBeNull();
    expect(getReturnPath({ state: { from: { search: '?x=1' } } })).toBeNull();
  });
});

describe('withReturnPath', () => {
  it('adds the return path as next, encoded once', () => {
    expect(withReturnPath('/register', '/team-invites/abc?x=1')).toBe(
      '/register?next=%2Fteam-invites%2Fabc%3Fx%3D1',
    );
    expect(withReturnPath('/login?verify_email=1&email=a%40b.co', '/team-invites/abc')).toBe(
      '/login?verify_email=1&email=a%40b.co&next=%2Fteam-invites%2Fabc',
    );
  });

  it('leaves the path alone without a return path', () => {
    expect(withReturnPath('/register', null)).toBe('/register');
    expect(buildAuthLinkState(null)).toBeUndefined();
    expect(buildAuthLinkState('/x')).toEqual({ from: '/x' });
  });
});

describe('getPostRegisterDestination', () => {
  it('returns a new account straight to where it came from', () => {
    expect(
      getPostRegisterDestination({
        email: 'new@example.com',
        requiresEmailVerification: false,
        returnPath: '/team-invites/abc',
      }),
    ).toEqual({ to: '/team-invites/abc', state: undefined });
  });

  it('falls back to the console without a return path', () => {
    expect(
      getPostRegisterDestination({ email: 'new@example.com', requiresEmailVerification: false, returnPath: null }),
    ).toEqual({ to: '/dashboard', state: undefined });
  });

  it('sends an account that must verify to login with the return path kept', () => {
    expect(
      getPostRegisterDestination({
        email: 'new@example.com',
        requiresEmailVerification: true,
        returnPath: '/team-invites/abc',
      }),
    ).toEqual({
      to: '/login?verify_email=1&email=new%40example.com&next=%2Fteam-invites%2Fabc',
      state: { from: '/team-invites/abc' },
    });
  });
});
