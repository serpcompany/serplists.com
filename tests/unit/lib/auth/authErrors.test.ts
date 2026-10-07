import { describe, expect, it } from 'vitest';
import {
  AuthStatusError,
  getAuthErrorMessage,
  isEmailNotVerifiedError,
  parseRetryAfterSeconds,
} from '@/lib/auth/authErrors';

const FALLBACK = 'Login failed';

describe('getAuthErrorMessage', () => {
  it("reads Better Auth's own { message }", () => {
    expect(getAuthErrorMessage({ message: 'Invalid email or password', status: 401 }, FALLBACK)).toBe(
      'Invalid email or password',
    );
  });

  it("reads the router's { error } when there is no message", () => {
    expect(
      getAuthErrorMessage(
        { error: 'Auth email is temporarily unavailable. Please contact support.', status: 503, statusText: '' },
        'Registration failed',
      ),
    ).toBe('Auth email is temporarily unavailable. Please contact support.');
  });

  it('prefers message over error', () => {
    expect(getAuthErrorMessage({ message: 'From message', error: 'From error' }, FALLBACK)).toBe('From message');
  });

  it.each([
    ['a 429 with the old router body', { error: 'Too many requests', status: 429, statusText: '' }],
    ['a 429 with no body', { status: 429, statusText: 'Too Many Requests' }],
    ["Better Auth's own 429", { message: 'Too many requests. Please try again later.', status: 429 }],
  ])('turns %s into a wait message, never a credentials message', (_label, error) => {
    const message = getAuthErrorMessage(error, FALLBACK);
    expect(message).toBe('Too many attempts. Please wait a few minutes and try again.');
  });

  it.each([
    [30, 'Too many attempts. Please try again in 30 seconds.'],
    [1, 'Too many attempts. Please try again in 1 second.'],
    [60, 'Too many attempts. Please try again in 1 minute.'],
    [61, 'Too many attempts. Please try again in 2 minutes.'],
    [240, 'Too many attempts. Please try again in 4 minutes.'],
  ])('uses retryAfterSeconds %s from the body', (retryAfterSeconds, expected) => {
    expect(getAuthErrorMessage({ error: 'Too many requests', status: 429, retryAfterSeconds }, FALLBACK)).toBe(
      expected,
    );
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['an empty object', {}],
    ['a blank message', { message: '   ', error: '' }],
    ['non-string fields', { message: { nested: true }, error: 42 }],
    ['statusText only', { status: 500, statusText: 'Internal Server Error' }],
    ['a string', 'boom'],
  ])('falls back for %s', (_label, error) => {
    expect(getAuthErrorMessage(error, FALLBACK)).toBe(FALLBACK);
  });

  it('never shows the technical message of a thrown error', () => {
    expect(getAuthErrorMessage(new TypeError('Failed to fetch'), FALLBACK)).toBe(FALLBACK);
    expect(getAuthErrorMessage(new AuthStatusError(500), FALLBACK)).toBe(FALLBACK);
  });

  it('shows the wait message for a rate-limited auth status check', () => {
    expect(getAuthErrorMessage(new AuthStatusError(429, 90), 'Unable to send reset email')).toBe(
      'Too many attempts. Please try again in 2 minutes.',
    );
  });
});

describe('isEmailNotVerifiedError', () => {
  it('matches the Better Auth code', () => {
    expect(isEmailNotVerifiedError({ code: 'EMAIL_NOT_VERIFIED', message: 'Something else', status: 403 })).toBe(
      true,
    );
  });

  it('still matches the message', () => {
    expect(isEmailNotVerifiedError({ message: 'Email not verified', status: 403 })).toBe(true);
  });

  it('does not match other errors', () => {
    expect(isEmailNotVerifiedError({ error: 'Too many requests', status: 429 })).toBe(false);
    expect(isEmailNotVerifiedError(null)).toBe(false);
  });
});

describe('parseRetryAfterSeconds', () => {
  it.each([
    ['120', 120],
    [' 5 ', 5],
    [null, undefined],
    ['', undefined],
    ['0', undefined],
    ['-3', undefined],
    ['soon', undefined],
    ['Wed, 21 Oct 2015 07:28:00 GMT', undefined],
  ])('parses %j as %j', (header, expected) => {
    expect(parseRetryAfterSeconds(header)).toBe(expected);
  });
});
