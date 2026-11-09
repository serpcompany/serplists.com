import { describe, expect, it } from 'vitest';
import { assertNotBlockedTestEmail, blockedTestEmailDomain } from '@functions/api/utils/test-email-block';
import { errorThrownBy } from '../../../support/thrownError';

describe('blockedTestEmailDomain', () => {
  it.each([
    ['john@serplists.dev', 'serplists.dev'],
    [' Jane@SERP-Checklists.dev ', 'serp-checklists.dev'],
  ])('names the test domain of %j', (email, domain) => {
    expect(blockedTestEmailDomain(email)).toBe(domain);
  });

  it.each(['john@test.com', 'serplists.dev', 'john@serplists.dev.example.com'])('blocks nothing for %j', (email) => {
    expect(blockedTestEmailDomain(email)).toBeNull();
  });
});

describe('assertNotBlockedTestEmail', () => {
  it('refuses an address on a test domain as forbidden', () => {
    expect(errorThrownBy(() => assertNotBlockedTestEmail('john@serplists.dev'))).toMatchObject({
      status: 'FORBIDDEN',
      message: 'Test accounts are disabled in production',
    });
  });
});
