import type { Env } from '../types';
import { isAuthEmailConfigured } from './auth-email';

export function isProductionAuthPolicy(env: Env): boolean {
  return env.AUTH_EMAIL_VERIFICATION_REQUIRED === 'true';
}

export function getAuthEmailPolicy(env: Env) {
  const emailAuthAvailable = isAuthEmailConfigured(env);
  const configuredRequirement = env.AUTH_EMAIL_VERIFICATION_REQUIRED;
  const emailVerificationRequired = configuredRequirement
    ? configuredRequirement === 'true'
    : emailAuthAvailable;

  return {
    accountRegistrationAvailable: emailAuthAvailable || !emailVerificationRequired,
    emailAuthAvailable,
    emailVerificationRequired,
  };
}
