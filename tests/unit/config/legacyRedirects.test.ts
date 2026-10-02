import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/builtRoutes';
import { describe, expect, it } from 'vitest';

const { redirects } = await loadBuiltRoutes('production');
const ORIGIN = 'https://serplists.com';

const agreedRedirectOnTheSiteHost = async (pathname: string) => {
  const worker = await workerRedirect(redirects, `${ORIGIN}${pathname}`);
  expect(nextServerRedirect(redirects, `${ORIGIN}${pathname}`), pathname).toEqual(worker);
  return worker;
};

describe('legacy redirects', () => {
  it.each([
    ['/account', '/dashboard/settings/', 308],
    ['/dashboard/profile', '/dashboard/settings/', 308],
    ['/console', '/dashboard/templates/', 308],
    ['/checklists', '/templates/', 308],
    ['/console/templates/tpl-1', '/dashboard/templates/tpl-1/', 308],
    ['/console/templates/tpl-1/edit', '/dashboard/templates/tpl-1/edit/', 308],
    ['/console/runs/run-1', '/dashboard/runs/run-1/', 308],
    ['/run/run-1', '/dashboard/runs/run-1/', 308],
    ['/run/84fd6800-2309-496f-a0c8-be1c8c01d9bc', '/dashboard/runs/84fd6800-2309-496f-a0c8-be1c8c01d9bc/', 308],
  ])('sends %s, with or without its slash, straight to %s, which answers without another hop', async (from, to, status) => {
    for (const path of [from, `${from}/`]) {
      expect(await agreedRedirectOnTheSiteHost(path), path).toEqual({ status, location: to });
    }
    expect(await agreedRedirectOnTheSiteHost(to), to).toBeNull();
  });

  it('sends /dashboard to My Templates with a 307, since the dashboard home may change', async () => {
    for (const path of ['/dashboard', '/dashboard/']) {
      expect(await agreedRedirectOnTheSiteHost(path), path).toEqual({ status: 307, location: '/dashboard/templates/' });
    }
    expect(await agreedRedirectOnTheSiteHost('/dashboard/templates/')).toBeNull();
  });

  it('adds no query of its own, so the Stripe billing result and other queries reach the page', async () => {
    for (const redirect of redirects) {
      expect(new URL(redirect.destination, ORIGIN).search, redirect.source).toBe('');
    }
    expect(await agreedRedirectOnTheSiteHost('/account?billing=success')).toEqual({
      status: 308,
      location: '/dashboard/settings/?billing=success',
    });
    for (const path of ['/run/run-1?from=email', '/run/run-1/?from=email']) {
      expect(await agreedRedirectOnTheSiteHost(path), path).toEqual({
        status: 308,
        location: '/dashboard/runs/run-1/?from=email',
      });
    }
  });

  it('leaves the live pages alone', async () => {
    for (const path of ['/dashboard/settings/', '/dashboard/templates/', '/dashboard/runs/run-1/', '/templates/', '/account-settings/']) {
      expect(await agreedRedirectOnTheSiteHost(path), path).toBeNull();
    }
  });

  it('gives the other form of a live page that only starts like a legacy path just its slash', async () => {
    expect(await agreedRedirectOnTheSiteHost('/account-settings')).toEqual({ status: 308, location: '/account-settings/' });
  });
});
