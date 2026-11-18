import { describe, expect, it } from 'vitest';
import { authRateLimitBucket, checkAuthRateLimit } from '@functions/api/utils/auth-rate-limit';

function attemptsUntilRefused(params: { method: string; path: string; ip: string; isLocal: boolean }, ceiling: number): number {
  for (let attempt = 1; attempt <= ceiling; attempt += 1) {
    if (checkAuthRateLimit(params)?.allowed === false) return attempt;
  }
  return Number.POSITIVE_INFINITY;
}

describe('authRateLimitBucket', () => {
  it.each([
    ['GET', 'auth/get-session', 'session'],
    ['get', 'auth/status', 'session'],
    ['POST', 'auth/sign-in/email', 'credential'],
    ['POST', 'auth/get-session', 'credential'],
  ])('puts %s %s in the %s bucket', (method, path, bucket) => {
    expect(authRateLimitBucket(method, path)).toBe(bucket);
  });

  it('limits nothing outside auth', () => {
    expect(authRateLimitBucket('POST', 'templates')).toBeNull();
    expect(checkAuthRateLimit({ method: 'POST', path: 'templates', ip: '198.51.100.1', isLocal: false })).toBeNull();
  });
});

describe('checkAuthRateLimit', () => {
  it('refuses the 31st credential attempt from one address in five minutes on a deployed Worker', () => {
    expect(attemptsUntilRefused({ method: 'POST', path: 'auth/sign-in/email', ip: '198.51.100.2', isLocal: false }, 400)).toBe(31);
  });

  it('allows 300 credential attempts an hour locally, so the browser tests can sign in again and again', () => {
    expect(attemptsUntilRefused({ method: 'POST', path: 'auth/sign-in/email', ip: '198.51.100.3', isLocal: true }, 400)).toBe(301);
  });

  it('counts session reads apart from credential attempts', () => {
    const ip = '198.51.100.4';
    attemptsUntilRefused({ method: 'POST', path: 'auth/sign-in/email', ip, isLocal: false }, 31);

    expect(checkAuthRateLimit({ method: 'GET', path: 'auth/get-session', ip, isLocal: false })).toMatchObject({ allowed: true, remaining: 599 });
  });
});
