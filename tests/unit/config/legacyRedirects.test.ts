import { describe, expect, it, vi } from 'vitest';

import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/nextRouting';

// Stripe returns buyers to /account?billing=success on sessions created before the return URL
// moved, and bookmarks use the other legacy paths. They are redirects in next.config.ts, which
// pass the request's query through to the destination (Next.js, and OpenNext in the Worker,
// merge it in; tests/e2e/route-structure.spec.ts checks it in the browser), and the browser
// keeps the hash. So Billing still sees ?billing= and can confirm Pro. Each goes straight to
// its page's canonical URL (the SERP URL standard), whichever form of the old path was asked.

vi.mock('@opennextjs/aws/adapters/config/index.js', async () => {
  const { openNextBuildConfig } = await import('../../support/nextRouting');
  return openNextBuildConfig();
});

const { redirects } = await loadBuiltRoutes('production');
const ORIGIN = 'https://serplists.com';

// The redirect a path takes on the site's own host, the same in the Worker and in Next.js.
const redirectFor = async (pathname: string) => {
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
    // A Run's page answered at /run/<id>/ too; /dashboard/runs/<id>/ is its one URL now.
    ['/run/run-1', '/dashboard/runs/run-1/', 308],
    ['/run/84fd6800-2309-496f-a0c8-be1c8c01d9bc', '/dashboard/runs/84fd6800-2309-496f-a0c8-be1c8c01d9bc/', 308],
    // The dashboard home is My Templates for now, which may change.
    ['/dashboard', '/dashboard/templates/', 307],
  ])('sends %s to %s', async (from, to, status) => {
    for (const path of [from, `${from}/`]) {
      expect(await redirectFor(path), path).toEqual({ status, location: to });
    }
  });

  it('adds no query of its own, so the Stripe billing result and other queries reach the page', async () => {
    for (const redirect of redirects) {
      expect(new URL(redirect.destination, ORIGIN).search, redirect.source).toBe('');
    }
    expect(await redirectFor('/account?billing=success')).toEqual({
      status: 308,
      location: '/dashboard/settings/?billing=success',
    });
    for (const path of ['/run/run-1?from=email', '/run/run-1/?from=email']) {
      expect(await redirectFor(path), path).toEqual({
        status: 308,
        location: '/dashboard/runs/run-1/?from=email',
      });
    }
  });

  it('leaves the live pages alone', async () => {
    for (const path of ['/dashboard/settings/', '/dashboard/templates/', '/dashboard/runs/run-1/', '/templates/', '/account-settings/']) {
      expect(await redirectFor(path), path).toBeNull();
    }
    // Their other form only gains its slash.
    expect(await redirectFor('/account-settings')).toEqual({ status: 308, location: '/account-settings/' });
  });
});
