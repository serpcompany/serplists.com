import { describe, expect, it } from 'vitest';
import { getAuthEmailPolicy, isProductionAuthPolicy } from '@functions/api/utils/auth-policy';
import type { Env } from '@functions/api/types';

function envWith(settings: Partial<Env>): Env {
  return { BETTER_AUTH_SECRET: 'better-auth-secret-with-32-characters!!', ...settings } as Env;
}

describe('getAuthEmailPolicy', () => {
  it.each([
    ['an email provider', { RESEND_API_KEY: 're_test_123' }, true],
    ['no email provider', {}, false],
  ])(
    'requires email verification without AUTH_EMAIL_VERIFICATION_REQUIRED only when there is %s, as in tests and ad hoc runs',
    (_label, settings, required) => {
      expect(getAuthEmailPolicy(envWith(settings))).toEqual({
        accountRegistrationAvailable: true,
        emailAuthAvailable: required,
        emailVerificationRequired: required,
      });
    },
  );

  it('follows AUTH_EMAIL_VERIFICATION_REQUIRED whenever a deployment sets it', () => {
    expect(getAuthEmailPolicy(envWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'false', RESEND_API_KEY: 're_test_123' })))
      .toMatchObject({ emailVerificationRequired: false });
    expect(getAuthEmailPolicy(envWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'true' }))).toEqual({
      accountRegistrationAvailable: false,
      emailAuthAvailable: false,
      emailVerificationRequired: true,
    });
  });
});

describe('isProductionAuthPolicy', () => {
  it('reads the production policy from AUTH_EMAIL_VERIFICATION_REQUIRED alone, never from a host', () => {
    expect(isProductionAuthPolicy(envWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'true' }))).toBe(true);
    expect(isProductionAuthPolicy(envWith({ AUTH_EMAIL_VERIFICATION_REQUIRED: 'false', FRONTEND_URL: 'https://serplists.com' }))).toBe(false);
    expect(isProductionAuthPolicy(envWith({}))).toBe(false);
  });
});
