import { APIError } from 'better-auth/api';

const blockedTestEmailDomains = new Set(['serplists.dev', 'serp-checklists.dev']);

export const TEST_ACCOUNTS_DISABLED_MESSAGE = 'Test accounts are disabled in production';

export function blockedTestEmailDomain(email: string): string | null {
  const lower = email.trim().toLowerCase();
  const atIndex = lower.lastIndexOf('@');
  if (atIndex < 0) return null;
  const domain = lower.slice(atIndex + 1);
  return blockedTestEmailDomains.has(domain) ? domain : null;
}

export function assertNotBlockedTestEmail(email: unknown): void {
  if (typeof email === 'string' && blockedTestEmailDomain(email)) {
    throw new APIError('FORBIDDEN', { message: TEST_ACCOUNTS_DISABLED_MESSAGE });
  }
}
