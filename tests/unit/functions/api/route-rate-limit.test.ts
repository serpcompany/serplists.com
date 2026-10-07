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
    ['POST', 'templates/generate-from-clipy', 'write'],
    ['GET', 'templates', null],
    ['GET', 'checklists/shared/abc', null],
    ['POST', 'auth/sign-in/email', null],
    ['POST', 'profiles/by-username', null],
    ['POST', 'profiles/by-handle', null],
  ])('%s %s -> %s', (method, path, expected) => {
    expect(routeRateLimitBucket(method, path)).toBe(expected);
  });

  it.each([
    ['POST', 'admin/entitlements/override'],
    ['DELETE', 'admin/entitlements/override'],
    ['GET', 'admin/entitlements/override'],
    ['HEAD', 'admin'],
    ['PROPFIND', 'admin/x'],
  ])('counts %s %s as admin, since a read must not be a free way to test guesses at the secret', (method, path) => {
    expect(routeRateLimitBucket(method, path)).toBe('admin');
  });
});

describe('rate limits by default, so no new state-changing route family ships without a limit', () => {
  it.each(['POST', 'PUT', 'PATCH', 'DELETE'])('counts %s to a route family the limiter does not name as a write', (method) => {
    expect(routeRateLimitBucket(method, 'a-route-family-added-later')).toBe('write');
    expect(routeRateLimitBucket(method, 'a-route-family-added-later/item-1')).toBe('write');
  });

  it('lets through only the exempt routes and what is under them, each with its reason', () => {
    for (const [route, reason] of Object.entries(RATE_LIMIT_EXEMPT_ROUTES)) {
      expect(reason.length, route).toBeGreaterThan(0);
      expect(routeRateLimitBucket('POST', route), route).toBeNull();
      expect(routeRateLimitBucket('POST', `${route}/nested`), route).toBeNull();
    }
    expect(routeRateLimitBucket('POST', 'profiles/by-username-and-more')).toBe('write');
  });
});
