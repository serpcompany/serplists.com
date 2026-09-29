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
import { getPostRegisterDestination, withReturnPath } from '@/lib/auth/returnPath';
import { canonicalPath } from '@/lib/http/urlStandard';
import * as routes from '@/lib/routes';

import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/nextRouting';

vi.mock('@opennextjs/aws/adapters/config/index.js', async () => {
  const { openNextBuildConfig } = await import('../../support/nextRouting');
  return openNextBuildConfig();
});

// SERP URL standard: every URL the app writes is the canonical form, so no link depends on a
// redirect. Each path below must be canonical and must be served, not redirected, by the
// production build's routing (the Worker's and Next.js's alike).

const { redirects } = await loadBuiltRoutes('production');

// The one alias: the dashboard's home. /dashboard/ answers 307 with the page that is the home
// for now (My Templates, next.config.ts), in one hop, so its links follow the home if it moves.
const ALIASES = new Map([['/dashboard/', '/dashboard/templates/']]);

const pathOf = (url: string) => new URL(url, 'https://serplists.com').pathname;

async function expectServedAsIs(url: string) {
  const pathname = pathOf(url);
  expect(canonicalPath(pathname), url).toBe(pathname);
  const absolute = new URL(url, 'https://serplists.com').href;
  const alias = ALIASES.get(pathname);
  const expected = alias ? { status: 307, location: `${alias}${new URL(absolute).search}` } : null;
  expect(await workerRedirect(redirects, absolute), url).toEqual(expected);
  expect(nextServerRedirect(redirects, absolute), url).toEqual(expected);
  if (alias) await expectServedAsIs(alias);
}

const template = { id: 'tpl-1', slug: 'weekly-review', userId: 'user-1', ownerProfile: { username: 'john.doe' } };

const BUILT_PATHS: Array<[string, string]> = [
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
  ['buildRunPath', routes.buildRunPath('run-1')],
  ['buildRunUrl', routes.buildRunUrl('run-1', 'https://serplists.com')],
  ['buildConsoleSettingsPath', routes.buildConsoleSettingsPath()],
  ['buildConsoleArchivePath', routes.buildConsoleArchivePath()],
  // Links and callbacks the auth pages and the API write.
  ['EMAIL_VERIFIED_CALLBACK_URL', EMAIL_VERIFIED_CALLBACK_URL],
  ['VERIFY_EMAIL_LOGIN_PATH', VERIFY_EMAIL_LOGIN_PATH],
  ['withReturnPath', withReturnPath(routes.buildLoginPath(), '/dashboard/templates/')],
  ['getPostRegisterDestination', getPostRegisterDestination({ requiresEmailVerification: false, returnPath: null })],
  ['buildTeamInvitePath (API)', buildTeamInvitePath('invite-token')],
  ...publicSiteLinks.filter((link) => !link.external).map((link): [string, string] => [`publicSiteLinks ${link.label}`, link.href]),
];

describe('route builders and the URLs the app writes', () => {
  it.each(BUILT_PATHS)('%s gives a canonical URL that is served as it is', async (_name, url) => {
    await expectServedAsIs(url);
  });

  it('checks every route builder routes.ts exports', () => {
    const builders = Object.keys(routes).filter((name) => /^build\w*Path$|^buildRunUrl$/.test(name));
    const checked = new Set(BUILT_PATHS.map(([name]) => name.split(' ')[0]));
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

// Hard-coded page links in the app: JSX hrefs and the paths handed to the router and the
// sign-in links. Builders cover the rest; this catches a new literal written without its slash.
describe('hard-coded links in src', () => {
  const sourceFiles = (directory: string): string[] =>
    readdirSync(directory).flatMap((name) => {
      const file = path.join(directory, name);
      if (statSync(file).isDirectory()) return sourceFiles(file);
      return /\.tsx?$/.test(name) && !/\.test\.tsx?$/.test(name) ? [file] : [];
    });

  const LINK_PATTERNS = [
    /\bhref=["'](\/[^"']*)["']/g,
    /\bhref=\{\s*["'`](\/[^"'`$]*)["'`]\s*\}/g,
    /\b(?:push|replace|navigate|withReturnPath)\(\s*["'`](\/[^"'`$]*)["'`]/g,
    /\bhref:\s*["'`](\/[^"'`$]*)["'`]/g,
  ];

  const nonCanonicalLinks = (source: string): string[] =>
    LINK_PATTERNS.flatMap((pattern) =>
      Array.from(source.matchAll(pattern), (match) => match[1]).filter((link) => {
        const pathname = link.split(/[?#]/)[0];
        return canonicalPath(pathname) !== pathname;
      }),
    );

  it('finds a link written without its slash', () => {
    const source = [
      '<Link href="/login">Log in</Link>',
      "<Link href={'/pricing?x=1'}>Pricing</Link>",
      "router.push('/dashboard/runs');",
      "navigate(withReturnPath('/login', returnPath));",
      "{ href: '/about', label: 'About' }",
      '<Link href="/about/">About</Link>',
      '<a href="/og-default.png">Image</a>',
    ].join('\n');
    expect(nonCanonicalLinks(source)).toEqual(['/login', '/pricing?x=1', '/dashboard/runs', '/login', '/about']);
  });

  it('links only to canonical URLs', () => {
    const found = sourceFiles('src').flatMap((file) =>
      nonCanonicalLinks(readFileSync(file, 'utf8')).map((link) => `${file}: ${link}`),
    );
    expect(found).toEqual([]);
  });
});
