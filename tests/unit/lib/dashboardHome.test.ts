import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/builtRoutes';
import { describe, expect, it } from 'vitest';

import { organizationConsole } from '@/lib/consoleRoutes';
import { buildConsoleHomePath, DASHBOARD_PATH } from '@/lib/routes';

const { redirects } = await loadBuiltRoutes('production');

describe('the dashboard home', () => {
  it('is where next.config.ts sends a typed /dashboard/, so links that skip the redirect open the same page', async () => {
    const url = `https://serplists.com${DASHBOARD_PATH}`;
    const expected = { status: 307, location: buildConsoleHomePath() };

    expect(await workerRedirect(redirects, url)).toEqual(expected);
    expect(nextServerRedirect(redirects, url)).toEqual(expected);
  });

  it("sends an Organization's bare console URL, with or without its slash, to that Organization's home in one hop", async () => {
    const expected = { status: 307, location: buildConsoleHomePath(organizationConsole('team-1')) };

    for (const path of ['/dashboard/organization/team-1', '/dashboard/organization/team-1/']) {
      const url = `https://serplists.com${path}`;
      expect(await workerRedirect(redirects, url), path).toEqual(expected);
      expect(nextServerRedirect(redirects, url), path).toEqual(expected);
    }
    const home = `https://serplists.com${expected.location}`;
    expect(await workerRedirect(redirects, home)).toBeNull();
    expect(nextServerRedirect(redirects, home)).toBeNull();
  });
});
