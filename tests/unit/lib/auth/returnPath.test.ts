import { describe, expect, it } from 'vitest';

import {
  getPostRegisterDestination,
  getPostSignInDestination,
  getReturnPath,
  sanitizeReturnPath,
  toSameOriginPath,
  withReturnPath,
} from '@/lib/auth/returnPath';

describe('sanitizeReturnPath', () => {
  it('keeps the path, query, and hash of an in-app path', () => {
    expect(sanitizeReturnPath('/team-invites/abc/?x=1#h')).toBe('/team-invites/abc/?x=1#h');
    expect(sanitizeReturnPath('/dashboard/settings/?billing=cancel#plan')).toBe(
      '/dashboard/settings/?billing=cancel#plan',
    );
  });

  it('returns the canonical form of a page path, so an older or hand-typed link opens its page without a redirect', () => {
    expect(sanitizeReturnPath('/team-invites/abc?x=1#h')).toBe('/team-invites/abc/?x=1#h');
    expect(sanitizeReturnPath('/dashboard/settings?billing=cancel#plan')).toBe(
      '/dashboard/settings/?billing=cancel#plan',
    );
    expect(sanitizeReturnPath('/profile/john.doe')).toBe('/profile/john.doe/');
    expect(sanitizeReturnPath('/')).toBe('/');
  });

  it('keeps percent-encoding as it is instead of decoding it', () => {
    expect(sanitizeReturnPath('/team-invites/a%2Fb/')).toBe('/team-invites/a%2Fb/');
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

  it.each([
    '/login',
    '/login/',
    '/login?verified=1',
    '/login/?verified=1',
    '/register',
    '/register/',
    '/forgot-password',
    '/forgot-password/',
    '/reset-password',
    '/reset-password/',
    '/LOGIN',
    '/LOGIN/',
  ])(
    'rejects the auth page %s so sign-in cannot loop',
    (value) => {
      expect(sanitizeReturnPath(value)).toBeNull();
    },
  );

  it.each([
    '/.//evil.com',
    '/..//evil.com/share/x',
    '/%2e//evil.com',
    '/%2E%2E//evil.com',
    '/./%2e//evil.com',
    '/.///evil.com',
    '/a/..//evil.com',
  ])('rejects %j, which the URL parser normalizes to the protocol-relative //evil.com of another origin', (value) => {
    expect(sanitizeReturnPath(value)).toBeNull();
  });

  it.each([
    ['/./dashboard/', '/dashboard/'],
    ['/a/../dashboard/?x=1#h', '/dashboard/?x=1#h'],
    ['/./%2fevil.com', '/%2fevil.com'],
  ])('accepts %j as the same-origin path %j', (value, expected) => {
    expect(sanitizeReturnPath(value)).toBe(expected);
  });

  it('only returns paths that resolve to the app origin', () => {
    const prefixes = ['', '/', '/.', '/..', '/a/..', '/%2e', '/%2e%2e', '/./%2e'];
    const middles = ['', '/', '//', '///', '/%2f'];
    for (const prefix of prefixes) {
      for (const middle of middles) {
        const result = sanitizeReturnPath(`${prefix}${middle}evil.com/share/x?y=1#h`);
        if (result !== null) {
          expect(result.startsWith('//')).toBe(false);
          expect(new URL(result, 'https://app.test').origin).toBe('https://app.test');
          expect(sanitizeReturnPath(result)).toBe(result);
        }
      }
    }
  });

  it('rejects non-strings', () => {
    expect(sanitizeReturnPath(undefined)).toBeNull();
    expect(sanitizeReturnPath(null)).toBeNull();
    expect(sanitizeReturnPath({ pathname: '/x' })).toBeNull();
  });
});

describe('getReturnPath', () => {
  it('reads the next parameter, which survives the email round trip', () => {
    expect(getReturnPath('?verified=1&next=%2Fteam-invites%2Fabc%2F%3Fx%3D1%23h')).toBe(
      '/team-invites/abc/?x=1#h',
    );
  });

  it('reads the query from useSearchParams too', () => {
    expect(getReturnPath(new URLSearchParams('next=%2Fdashboard%2Fsettings%2F%3Fbilling%3Dsuccess%23x'))).toBe(
      '/dashboard/settings/?billing=success#x',
    );
  });

  it('returns null without a return path, so Login falls back to the console home', () => {
    expect(getReturnPath('')).toBeNull();
    expect(getReturnPath('?verified=1')).toBeNull();
    expect(getReturnPath('?next=')).toBeNull();
  });

  it.each([
    '?next=https%3A%2F%2Fevil.com',
    '?next=%2F%2Fevil.com%2Fdashboard',
    '?next=%2F.%2F%2Fevil.com%2Fshare%2Fx',
    '?next=/.//evil.com/share/x',
    '?next=%2F%5Cevil.com',
    '?next=javascript%3Aalert(1)',
    '?next=dashboard%2Fsettings',
    '?next=%2Flogin%3Fverified%3D1',
    '?next=%2Flogin%2F%3Fverified%3D1',
  ])('rejects %j, which is not a same-origin, non-auth path', (search) => {
    expect(getReturnPath(search)).toBeNull();
  });
});

describe('toSameOriginPath', () => {
  const origin = 'https://app.test';

  it('returns the path, query, and hash of a same-origin target', () => {
    expect(toSameOriginPath('/share/abc?x=1#h', origin)).toBe('/share/abc?x=1#h');
    expect(toSameOriginPath('/./dashboard', origin)).toBe('/dashboard');
  });

  it.each(['//evil.com/share/x', '/.//evil.com/share/x', '/%2e//evil.com', 'https://evil.com/share/x'])(
    'returns null for %j, which leaves the origin',
    (value) => {
      expect(toSameOriginPath(value, origin)).toBeNull();
    },
  );
});

describe('withReturnPath', () => {
  it('adds the return path as next, encoded once', () => {
    expect(withReturnPath('/register/', '/team-invites/abc/?x=1')).toBe(
      '/register/?next=%2Fteam-invites%2Fabc%2F%3Fx%3D1',
    );
    expect(withReturnPath('/login/?verify_email=1&email=a%40b.co', '/team-invites/abc/')).toBe(
      '/login/?verify_email=1&email=a%40b.co&next=%2Fteam-invites%2Fabc%2F',
    );
  });

  it('leaves the path alone without a return path', () => {
    expect(withReturnPath('/register/', null)).toBe('/register/');
  });
});

describe('getPostSignInDestination', () => {
  it('returns someone to where they were headed', () => {
    expect(getPostSignInDestination('/team-invites/abc/?x=1#h')).toBe('/team-invites/abc/?x=1#h');
  });

  it('opens the dashboard home, which opens the remembered context, not Account Settings, without a return path', () => {
    expect(getPostSignInDestination(null)).toBe('/dashboard/');
  });
});

describe('getPostRegisterDestination', () => {
  it('returns a new account straight to where it came from', () => {
    expect(
      getPostRegisterDestination({ requiresEmailVerification: false, returnPath: '/team-invites/abc/' }),
    ).toBe('/team-invites/abc/');
  });

  it('falls back to the console without a return path', () => {
    expect(getPostRegisterDestination({ requiresEmailVerification: false, returnPath: null })).toBe('/dashboard/');
  });

  it('sends an account that must verify to login with the return path kept', () => {
    expect(
      getPostRegisterDestination({ requiresEmailVerification: true, returnPath: '/team-invites/abc/' }),
    ).toBe('/login/?verify_email=1&next=%2Fteam-invites%2Fabc%2F');
  });

  it('never puts the new account email in the login URL (sign-up hands it over in sessionStorage)', () => {
    expect(getPostRegisterDestination({ requiresEmailVerification: true, returnPath: null })).toBe(
      '/login/?verify_email=1',
    );
  });
});
