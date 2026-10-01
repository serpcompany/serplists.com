import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';

import { buildTeamInvitePath } from '@functions/api/utils/team-invite-delivery';
import {
  bundledTemplateEntries,
  catalogPageEntry,
  renderSitemapIndex,
  renderUrlset,
  staticSitemapEntries,
} from '@functions/sitemap/shared';
import { publicSiteLinks } from '@/components/layout/publicSiteLinks';
import { EMAIL_VERIFIED_CALLBACK_URL } from '@/lib/auth/loginNotice';
import { VERIFY_EMAIL_LOGIN_PATH } from '@/lib/auth/loginPrefill';
import { getPostRegisterDestination, getPostSignInDestination, withReturnPath } from '@/lib/auth/returnPath';
import { canonicalPath } from '@/lib/http/urlStandard';
import * as routes from '@/lib/routes';

import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/nextRouting';

vi.mock('@opennextjs/aws/adapters/config/index.js', async () => {
  const { openNextBuildConfig } = await import('../../support/nextRouting');
  return openNextBuildConfig();
});

const { redirects } = await loadBuiltRoutes('production');

const pathOf = (url: string) => new URL(url, 'https://serplists.com').pathname;

async function expectServedAsIs(url: string) {
  const pathname = pathOf(url);
  expect(canonicalPath(pathname), url).toBe(pathname);
  const absolute = new URL(url, 'https://serplists.com').href;
  expect(await workerRedirect(redirects, absolute), url).toBeNull();
  expect(nextServerRedirect(redirects, absolute), url).toBeNull();
}

const template = { id: 'tpl-1', slug: 'weekly-review', userId: 'user-1', ownerProfile: { username: 'john.doe' } };

const ROUTE_BUILDER_PATHS: Array<[string, string]> = [
  ['buildHomePath', routes.buildHomePath()],
  ['buildLoginPath', routes.buildLoginPath()],
  ['buildRegisterPath', routes.buildRegisterPath()],
  ['buildForgotPasswordPath', routes.buildForgotPasswordPath()],
  ['buildResetPasswordPath', routes.buildResetPasswordPath()],
  ['buildPricingPath', routes.buildPricingPath()],
  ['buildAboutPath', routes.buildAboutPath()],
  ['buildContactPath', routes.buildContactPath()],
  ['buildPublicTemplatesPath', routes.buildPublicTemplatesPath()],
  ['buildPublicCategoriesPath', routes.buildPublicCategoriesPath()],
  ['buildPublicCategoryPathForSlug', routes.buildPublicCategoryPathForSlug('seo')],
  ['buildPublicCategoryPath', routes.buildPublicCategoryPath('日本語')!],
  ['resolveLegacyTemplatesCategoryRedirectPath', routes.resolveLegacyTemplatesCategoryRedirectPath(new URLSearchParams('category=SEO'))!],
  ['buildPublicProfilePath', routes.buildPublicProfilePath('alice')],
  ['buildPublicProfilePath (a username that looks like a file)', routes.buildPublicProfilePath('john.doe')],
  ['buildProfilePreviewPath', routes.buildProfilePreviewPath('Alice', 'alice')!],
  ['getCanonicalProfilePath', routes.getCanonicalProfilePath('Alice', 'alice')!],
  ['buildPublicTemplatePath', routes.buildPublicTemplatePath('alice', 'weekly-review')],
  ['buildCanonicalPublicTemplatePath', routes.buildCanonicalPublicTemplatePath(template)!],
  ['buildPublicFeaturesPath', routes.buildPublicFeaturesPath()],
  ['buildPublicFeaturePath', routes.buildPublicFeaturePath('template-builder')],
  ['buildSharePath', routes.buildSharePath('share-token')],
  ['buildConsoleHomePath', routes.buildConsoleHomePath()],
  ['buildConsoleTemplatesPath', routes.buildConsoleTemplatesPath()],
  ['buildConsoleTemplateCreatePath', routes.buildConsoleTemplateCreatePath()],
  ['buildConsoleTemplateImportPath', routes.buildConsoleTemplateImportPath()],
  ['buildConsoleTemplatePath', routes.buildConsoleTemplatePath('tpl-1')],
  ['buildConsoleTemplateEditPath', routes.buildConsoleTemplateEditPath('tpl-1')],
  ['buildConsoleRunsPath', routes.buildConsoleRunsPath()],
  ['buildConsoleRunPath', routes.buildConsoleRunPath('run-1')],
  ['buildConsoleSettingsPath', routes.buildConsoleSettingsPath()],
  ['buildConsoleArchivePath', routes.buildConsoleArchivePath()],
];

const AUTH_PAGE_AND_API_LINKS: Array<[string, string]> = [
  ['EMAIL_VERIFIED_CALLBACK_URL', EMAIL_VERIFIED_CALLBACK_URL],
  ['VERIFY_EMAIL_LOGIN_PATH', VERIFY_EMAIL_LOGIN_PATH],
  ['withReturnPath', withReturnPath(routes.buildLoginPath(), '/dashboard/templates/')],
  ['getPostRegisterDestination', getPostRegisterDestination({ requiresEmailVerification: false, returnPath: null })],
  ['getPostSignInDestination', getPostSignInDestination(null)],
  ['buildTeamInvitePath (API)', buildTeamInvitePath('invite-token')],
];

const PUBLIC_SITE_LINK_PATHS = publicSiteLinks
  .filter((link) => !link.external)
  .map((link): [string, string] => [`publicSiteLinks ${link.label}`, link.href]);

describe('route builders and the URLs the app writes', () => {
  it.each([...ROUTE_BUILDER_PATHS, ...AUTH_PAGE_AND_API_LINKS, ...PUBLIC_SITE_LINK_PATHS])(
    '%s gives a canonical URL that is served as it is',
    async (_name, url) => {
      await expectServedAsIs(url);
    },
  );

  it('checks every route builder routes.ts exports', () => {
    const builders = Object.keys(routes).filter((name) => /^build\w*Path$/.test(name));
    const checked = new Set(ROUTE_BUILDER_PATHS.map(([name]) => name.split(' ')[0]));
    expect(builders.filter((name) => !checked.has(name))).toEqual([]);
  });
});

describe('sitemap entries', () => {
  it('lists every static page, bundled template and catalog page in canonical form', async () => {
    const entries = [
      ...staticSitemapEntries(),
      ...bundledTemplateEntries(),
      catalogPageEntry('/templates/'),
      catalogPageEntry('/categories/'),
    ];
    expect(entries.length).toBeGreaterThan(5);
    for (const entry of entries) await expectServedAsIs(entry.path);
  });

  it('writes every <loc> in canonical form, pages with a slash and sitemap files without', async () => {
    const urlset = renderUrlset([{ path: '/profile/alice' }, { path: '/categories/seo/' }, { path: '/' }]);
    const index = renderSitemapIndex([{ path: '/sitemaps/pages/1.xml' }]);
    const locs = [...`${urlset}${index}`.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]);
    expect(locs).toEqual([
      'https://serplists.com/profile/alice/',
      'https://serplists.com/categories/seo/',
      'https://serplists.com/',
      'https://serplists.com/sitemaps/pages/1.xml',
    ]);
    for (const loc of locs) await expectServedAsIs(loc);
  });
});

const HARD_CODED_LINK_PATTERNS = {
  jsxHref: /\bhref=["'](\/[^"']*)["']/g,
  jsxHrefExpression: /\bhref=\{\s*["'`](\/[^"'`$]*)["'`]\s*\}/g,
  routerOrSignInPath: /\b(?:push|replace|navigate|withReturnPath)\(\s*["'`](\/[^"'`$]*)["'`]/g,
  hrefProperty: /\bhref:\s*["'`](\/[^"'`$]*)["'`]/g,
};

describe('hard-coded links in src, which the route builders do not cover', () => {
  const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) return sourceFiles(file);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
    });

  const linksIn = (source: string): string[] =>
    Object.values(HARD_CODED_LINK_PATTERNS).flatMap((pattern) => Array.from(source.matchAll(pattern), (match) => match[1]));

  const linksNotCanonicalOrRedirected = async (source: string): Promise<string[]> => {
    const bad: string[] = [];
    for (const link of linksIn(source)) {
      const pathname = pathOf(link);
      const redirect = await workerRedirect(redirects, new URL(link, 'https://serplists.com').href);
      if (canonicalPath(pathname) !== pathname || redirect) bad.push(link);
    }
    return bad;
  };

  it('finds a link written without its slash, or one that only redirects, such as a legacy path or /dashboard/', async () => {
    const source = [
      '<Link href="/login">Log in</Link>',
      "<Link href={'/pricing?x=1'}>Pricing</Link>",
      "router.push('/dashboard/runs');",
      "navigate(withReturnPath('/login', returnPath));",
      "{ href: '/about', label: 'About' }",
      '<Link href="/about/">About</Link>',
      '<a href="/og-default.png">Image</a>',
      "router.replace('/dashboard/');",
      '<Link href="/account/">Account</Link>',
    ].join('\n');
    expect(await linksNotCanonicalOrRedirected(source)).toEqual([
      '/login',
      '/account/',
      '/pricing?x=1',
      '/dashboard/runs',
      '/login',
      '/dashboard/',
      '/about',
    ]);
  });

  it('links only to canonical URLs, which answer without a redirect', async () => {
    const found: string[] = [];
    for (const file of sourceFiles('src')) {
      for (const link of await linksNotCanonicalOrRedirected(readFileSync(file, 'utf8'))) found.push(`${file}: ${link}`);
    }
    expect(found).toEqual([]);
  });
});
