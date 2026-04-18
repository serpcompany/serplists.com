import { describe, expect, it } from 'vitest';

import { buildPublicProfilePath } from '@/lib/routes';
import { resolveDashboardProfileRedirectTarget } from '@/lib/dashboardRouteAliases';

describe('dashboard route aliases', () => {
  it('prefers the current user public profile for /dashboard/profile', () => {
    expect(
      resolveDashboardProfileRedirectTarget({
        email: 'alice@example.com',
        id: 'user-1',
        username: 'alice',
      }),
    ).toBe(buildPublicProfilePath('alice'));
  });

  it('falls back to /account when no username is available', () => {
    expect(
      resolveDashboardProfileRedirectTarget({
        email: 'alice@example.com',
        id: 'user-1',
      }),
    ).toBe('/account');

    expect(resolveDashboardProfileRedirectTarget(null)).toBe('/account');
  });
});
