import type { Env } from '../types';
import { isAuthEmailConfigured } from './auth-email';

/**
 * The auth policy is explicit per deployment in wrangler.toml:
 * AUTH_EMAIL_VERIFICATION_REQUIRED is "false" on local and preview and "true" on
 * production. Never infer the environment from the request hostname: preview
 * aliases and custom staging domains (staging.serplists.com) must behave like
 * staging.serp-checklists.pages.dev (docs/design-docs/database-operations.md).
 *
 * The production policy also turns on the checks that only make sense for real
 * accounts: blocking test-email domains and breached-password lookups.
 */
export function isProductionAuthPolicy(env: Env): boolean {
  return env.AUTH_EMAIL_VERIFICATION_REQUIRED === 'true';
}

export function getAuthEmailPolicy(env: Env) {
  const emailAuthAvailable = isAuthEmailConfigured(env);
  const configuredRequirement = env.AUTH_EMAIL_VERIFICATION_REQUIRED;
  // Unset only outside the deployed environments (tests, ad hoc runs): require
  // verification when email can be sent.
  const emailVerificationRequired = configuredRequirement
    ? configuredRequirement === 'true'
    : emailAuthAvailable;

  return {
    accountRegistrationAvailable: emailAuthAvailable || !emailVerificationRequired,
    emailAuthAvailable,
    emailVerificationRequired,
  };
}
