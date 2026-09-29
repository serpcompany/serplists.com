import { PHASE_PRODUCTION_SERVER } from 'next/constants';
import { getPathMatch } from 'next/dist/shared/lib/router/utils/path-match';
import { compileNonPath } from 'next/dist/shared/lib/router/utils/prepare-destination';
import { describe, expect, it } from 'vitest';

import nextConfigFor from '../../../next.config';

// Stripe returns buyers to /account?billing=success on sessions created before the return URL
// moved, and bookmarks use the other legacy paths. They are redirects in next.config.ts, which
// pass the request's query through to the destination (Next.js, and OpenNext in the Worker,
// merge it in; tests/e2e/route-structure.spec.ts checks it in the browser), and the browser
// keeps the hash. So Billing still sees ?billing= and can confirm Pro.

type Redirect = { source: string; destination: string; permanent?: boolean; statusCode?: number };

const redirects = (await nextConfigFor(PHASE_PRODUCTION_SERVER).redirects?.()) as Redirect[];

// The redirect a path takes, with its destination filled in from the path's params.
const redirectFor = (pathname: string) => {
  for (const redirect of redirects) {
    const params = getPathMatch(redirect.source, { removeUnnamedParams: true })(pathname);
    if (params === false) continue;
    return { ...redirect, location: `/${compileNonPath(redirect.destination.replace(/^\//, ''), params)}` };
  }
  return null;
};

describe('legacy redirects', () => {
  it.each([
    ['/account', '/dashboard/settings', true],
    ['/dashboard/profile', '/dashboard/settings', true],
    ['/console', '/dashboard/templates', true],
    ['/checklists', '/templates', true],
    ['/console/templates/tpl-1', '/dashboard/templates/tpl-1', true],
    ['/console/templates/tpl-1/edit', '/dashboard/templates/tpl-1/edit', true],
    ['/console/runs/run-1', '/dashboard/runs/run-1', true],
    // The dashboard home is My Templates for now, which may change.
    ['/dashboard', '/dashboard/templates', false],
  ])('sends %s to %s', (from, to, permanent) => {
    const redirect = redirectFor(from);

    expect(redirect?.location).toBe(to);
    expect(redirect?.permanent).toBe(permanent);
  });

  it('adds no query of its own, so the Stripe billing result and other queries reach the page', () => {
    for (const redirect of redirects) {
      expect(new URL(redirect.destination, 'https://serplists.com').search, redirect.source).toBe('');
    }
  });

  it('leaves the live pages alone', () => {
    for (const path of ['/dashboard/settings', '/dashboard/templates', '/templates', '/account-settings']) {
      expect(redirectFor(path), path).toBeNull();
    }
  });
});
