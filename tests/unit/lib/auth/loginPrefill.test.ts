import { describe, expect, it } from 'vitest';

import { isSensitiveAnalyticsLocation } from '@/lib/analyticsUrl';
import {
  VERIFY_EMAIL_LOGIN_PATH,
  buildKeptLoginState,
  handOffLoginEmail,
  readKeptLoginEmail,
  readLoginPrefill,
  peekHandedOffLoginEmail,
  takeHandedOffLoginEmail,
} from '@/lib/auth/loginPrefill';

const memoryStorage = () => {
  const values = new Map<string, string>();
  return {
    values,
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
    removeItem: (key: string) => {
      values.delete(key);
    },
  };
};

describe('the sign-up email handoff', () => {
  it('keeps the new account email out of the login URL', () => {
    const url = new URL(VERIFY_EMAIL_LOGIN_PATH, 'https://serplists.com');

    expect(url.pathname).toBe('/login/');
    expect(url.searchParams.get('verify_email')).toBe('1');
    expect(url.searchParams.has('email')).toBe(false);
    expect(isSensitiveAnalyticsLocation(url.pathname, url.search)).toBe(false);
  });

  it('hands the address to the login page once', () => {
    const storage = memoryStorage();
    handOffLoginEmail('alice+new@example.com', storage);

    expect(peekHandedOffLoginEmail(storage)).toBe('alice+new@example.com');
    expect(peekHandedOffLoginEmail(storage)).toBe('alice+new@example.com');
    expect(takeHandedOffLoginEmail(storage)).toBe('alice+new@example.com');
    expect(takeHandedOffLoginEmail(storage)).toBeNull();
    expect(peekHandedOffLoginEmail(storage)).toBeNull();
  });

  it('never throws when storage is blocked or full', () => {
    const blocked = {
      getItem: () => {
        throw new DOMException('denied', 'SecurityError');
      },
      setItem: () => {
        throw new DOMException('full', 'QuotaExceededError');
      },
      removeItem: () => undefined,
    };

    expect(() => handOffLoginEmail('a@b.c', blocked)).not.toThrow();
    expect(peekHandedOffLoginEmail(blocked)).toBeNull();
    expect(takeHandedOffLoginEmail(blocked)).toBeNull();
    expect(takeHandedOffLoginEmail(undefined)).toBeNull();
  });

  it('reads the address the login page keeps in its history entry', () => {
    expect(readKeptLoginEmail(buildKeptLoginState('alice@example.com'))).toBe('alice@example.com');
    // Next.js adds its own router state to the entry.
    expect(readKeptLoginEmail({ email: 'alice@example.com', __NA: true })).toBe('alice@example.com');
    expect(readKeptLoginEmail({ __NA: true })).toBeNull();
    expect(readKeptLoginEmail({ email: '   ' })).toBeNull();
    expect(readKeptLoginEmail(null)).toBeNull();
  });
});

describe('readLoginPrefill', () => {
  it('fills in the address sign-up handed over or the entry kept', () => {
    expect(readLoginPrefill('?verify_email=1', 'alice@example.com')).toEqual({
      email: 'alice@example.com',
      searchWithoutEmail: null,
    });
  });

  it('still reads old links that carry the email in the URL, and asks for it to be removed', () => {
    expect(readLoginPrefill('?verify_email=1&email=alice%40example.com', null)).toEqual({
      email: 'alice@example.com',
      searchWithoutEmail: '?verify_email=1',
    });
    expect(readLoginPrefill('?email=a%40b.c', null)).toMatchObject({
      email: 'a@b.c',
      searchWithoutEmail: '',
    });
  });

  it('prefers the kept address over an old link', () => {
    expect(readLoginPrefill('?email=old%40b.c', 'kept@b.c').email).toBe('kept@b.c');
  });

  it('removes email parameters in any letter case', () => {
    expect(readLoginPrefill('?Email=a%40b.c&verified=1', null)).toMatchObject({
      searchWithoutEmail: '?verified=1',
    });
  });

  it('fills in nothing without an address', () => {
    expect(readLoginPrefill('', '   ').email).toBeNull();
    expect(readLoginPrefill('?email=%20', null).email).toBeNull();
    expect(readLoginPrefill('', null)).toEqual({
      email: null,
      searchWithoutEmail: null,
    });
  });
});
