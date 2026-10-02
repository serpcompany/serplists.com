import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/builtRoutes';
import { describe, expect, it } from 'vitest';

import { buildConsoleHomePath, DASHBOARD_PATH } from '@/lib/routes';

const { redirects } = await loadBuiltRoutes('production');

describe('the dashboard home', () => {
  it('is where next.config.ts sends a typed /dashboard/, so links that skip the redirect open the same page', async () => {
    const url = `https://serplists.com${DASHBOARD_PATH}`;
    const expected = { status: 307, location: buildConsoleHomePath() };

    expect(await workerRedirect(redirects, url)).toEqual(expected);
    expect(nextServerRedirect(redirects, url)).toEqual(expected);
  });
});
