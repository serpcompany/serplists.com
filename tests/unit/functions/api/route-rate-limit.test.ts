import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  RATE_LIMIT_EXEMPT_ROUTES,
  routeRateLimitBucket,
} from '@functions/api/utils/route-rate-limit';

describe('routeRateLimitBucket', () => {
  it.each([
    ['POST', 'billing/checkout', 'billing'],
    ['POST', 'billing/portal', 'billing'],
    ['POST', 'billing', 'billing'],
    ['GET', 'billing/status', null],
    ['POST', 'stripe/webhook', null],
    ['POST', 'templates', 'write'],
    ['PUT', 'templates/abc', 'write'],
    ['DELETE', 'checklists/abc', 'write'],
    ['PATCH', 'teams/abc', 'write'],
    ['POST', 'uploads', 'write'],
    ['POST', 'agent-keys', 'write'],
    ['DELETE', 'agent-keys/key-1', 'write'],
    ['POST', 'mcp', 'mcp'],
    ['GET', 'mcp', null],
    // Every admin request counts: the endpoint checks a secret, and a GET must not be a
    // free way to test guesses.
    ['POST', 'admin/entitlements/override', 'admin'],
    ['DELETE', 'admin/entitlements/override', 'admin'],
    ['GET', 'admin/entitlements/override', 'admin'],
    ['HEAD', 'admin', 'admin'],
    ['PROPFIND', 'admin/x', 'admin'],
    ['POST', 'templates/generate-from-clipy', 'write'],
    ['GET', 'templates', null],
    ['GET', 'checklists/shared/abc', null],
    ['POST', 'auth/sign-in/email', null],
    ['POST', 'profiles/by-username', null],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(routeRateLimitBucket(method, path)).toBe(expected);
  });
});

// A new state-changing route family must not ship without a limit: every path
// literal the router dispatches on is either limited for POST or exempt with a reason.
describe('router rate limit coverage', () => {
  const routerSource = readFileSync(resolve(__dirname, '../../../../functions/api/[[route]].ts'), 'utf8');
  const dispatched = Array.from(
    routerSource.matchAll(/path(?:\s*===\s*|\.startsWith\()'([^']+)'/g),
    (match) => match[1],
  );
  const families = Array.from(new Set(dispatched));

  it('finds the route families the router dispatches', () => {
    expect(families).toEqual(expect.arrayContaining(['billing', 'stripe', 'templates', 'admin', 'mcp', 'auth']));
  });

  it.each(families)('POST %s is limited or explicitly exempt', (family) => {
    const exemptFamily = Object.keys(RATE_LIMIT_EXEMPT_ROUTES).find(
      (exempt) => family === exempt || family.startsWith(`${exempt}/`),
    );
    if (exemptFamily) {
      expect(RATE_LIMIT_EXEMPT_ROUTES[exemptFamily].length).toBeGreaterThan(0);
      return;
    }
    expect(routeRateLimitBucket('POST', family)).not.toBeNull();
  });
});
