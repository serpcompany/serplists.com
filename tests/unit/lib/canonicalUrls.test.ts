import { loadBuiltRoutes, nextServerRedirect, workerRedirect } from '../../support/builtRoutes';
import { everyPublicSiteLink } from '../../support/publicSiteLinks';
import { describe, expect, it } from 'vitest';
import { capturedGroup, present } from '../../support/elements';

import { buildTeamInvitePath } from '@functions/api/utils/team-invite-delivery';
import {
  bundledTemplateEntries,
  catalogPageEntry,
  renderSitemapIndex,
  renderUrlset,
  staticSitemapEntries,
} from '@functions/sitemap/shared';
import { EMAIL_VERIFIED_CALLBACK_URL } from '@/lib/auth/loginNotice';
import { VERIFY_EMAIL_LOGIN_PATH } from '@/lib/auth/loginPrefill';
import { getPostRegisterDestination, getPostSignInDestination, withReturnPath } from '@/lib/auth/returnPath';
import * as consoleRoutes from '@/lib/consoleRoutes';
import { canonicalPath } from '@/lib/http/urlStandard';
import * as routes from '@/lib/routes';

const { redirects } = await loadBuiltRoutes('production');

const pathOf = (url: string) => new URL(url, 'https://serplists.com').pathname;

async function expectServedAsIs(url: string) {
  const pathname = pathOf(url);
  expect(canonicalPath(pathname), url).toBe(pathname);
  const absolute = new URL(url, 'https://serplists.com').href;
  expect(await workerRedirect(redirects, absolute), url).toBeNull();
  expect(nextServerRedirect(redirects, absolute), url).toBeNull();
}

const personal = consoleRoutes.PERSONAL_CONSOLE;

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
  ['buildPublicCategoryPath', present(routes.buildPublicCategoryPath('日本語'), 'the path of a category')],
  ['resolveLegacyTemplatesCategoryRedirectPath', present(routes.resolveLegacyTemplatesCategoryRedirectPath(new URLSearchParams('category=SEO')), 'the redirect of a legacy category link')],
  ['buildPublicProfilePath', routes.buildPublicProfilePath('alice')],
  ['buildPublicProfilePath (a username that looks like a file)', routes.buildPublicProfilePath('john.doe')],
  ['buildProfilePreviewPath', present(routes.buildProfilePreviewPath('Alice', 'alice'), 'the preview path of a profile')],
  ['getCanonicalProfilePath', present(routes.getCanonicalProfilePath('Alice', 'alice'), 'the canonical path of a profile')],
  ['buildPublicTemplatePath', routes.buildPublicTemplatePath('alice', 'weekly-review')],
  ['buildCanonicalPublicTemplatePath', present(routes.buildCanonicalPublicTemplatePath(template), 'the canonical path of a template')],
  ['buildPublicFeaturesPath', routes.buildPublicFeaturesPath()],
  ['buildPublicFeaturePath', routes.buildPublicFeaturePath('template-builder')],
  ['buildSharePath', routes.buildSharePath('share-token')],
  ['buildConsoleHomePath', routes.buildConsoleHomePath(personal)],
  ['buildConsoleTemplatesPath', routes.buildConsoleTemplatesPath(personal)],
  ['buildConsoleTemplateCreatePath', routes.buildConsoleTemplateCreatePath(personal)],
  ['buildConsoleTemplateImportPath', routes.buildConsoleTemplateImportPath(personal)],
  ['buildConsoleTemplatePath', routes.buildConsoleTemplatePath('tpl-1', personal)],
  ['buildConsoleTemplateEditPath', routes.buildConsoleTemplateEditPath('tpl-1', personal)],
  ['buildConsoleRunsPath', routes.buildConsoleRunsPath(personal)],
  ['buildConsoleRunPath', routes.buildConsoleRunPath('run-1', personal)],
  ['buildConsoleSettingsPath', routes.buildConsoleSettingsPath(personal)],
  ['buildConsoleArchivePath', routes.buildConsoleArchivePath(personal)],
];

const acme = consoleRoutes.organizationConsole('team-1');

const ORGANIZATION_ROUTE_BUILDER_PATHS: Array<[string, string]> = [
  ['buildConsoleHomePath (an Organization)', consoleRoutes.buildConsoleHomePath(acme)],
  ['buildConsoleTemplatesPath (an Organization)', consoleRoutes.buildConsoleTemplatesPath(acme)],
  ['buildConsoleTemplateCreatePath (an Organization)', consoleRoutes.buildConsoleTemplateCreatePath(acme)],
  ['buildConsoleTemplateImportPath (an Organization)', consoleRoutes.buildConsoleTemplateImportPath(acme)],
  ['buildConsoleTemplatePath (an Organization)', consoleRoutes.buildConsoleTemplatePath('tpl-1', acme)],
  ['buildConsoleTemplateEditPath (an Organization)', consoleRoutes.buildConsoleTemplateEditPath('tpl-1', acme)],
  ['buildConsoleRunsPath (an Organization)', consoleRoutes.buildConsoleRunsPath(acme)],
  ['buildConsoleRunPath (an Organization)', consoleRoutes.buildConsoleRunPath('run-1', acme)],
  ['buildConsoleSettingsPath (an Organization)', consoleRoutes.buildConsoleSettingsPath(acme)],
  ['buildConsoleArchivePath (an Organization)', consoleRoutes.buildConsoleArchivePath(acme)],
  ['buildConsoleRoutePath', consoleRoutes.buildConsoleRoutePath({ context: acme, section: { name: 'run', runId: 'run-1' } })],
  [
    'buildEquivalentConsolePath',
    present(consoleRoutes.buildEquivalentConsolePath('/dashboard/templates/tpl-1/', acme), 'the equivalent path in an Organization'),
  ],
  [
    'buildOwnerContextPath',
    present(consoleRoutes.buildOwnerContextPath('/dashboard/runs/run-1/', acme), "a Run's path in its Organization"),
  ],
];

const AUTH_PAGE_AND_API_LINKS: Array<[string, string]> = [
  ['EMAIL_VERIFIED_CALLBACK_URL', EMAIL_VERIFIED_CALLBACK_URL],
  ['VERIFY_EMAIL_LOGIN_PATH', VERIFY_EMAIL_LOGIN_PATH],
  ['withReturnPath', withReturnPath(routes.buildLoginPath(), '/dashboard/templates/')],
  ['getPostRegisterDestination', getPostRegisterDestination({ requiresEmailVerification: false, returnPath: null })],
  ['getPostSignInDestination', getPostSignInDestination(null)],
  ['buildTeamInvitePath (API)', buildTeamInvitePath('invite-token')],
];

const PUBLIC_SITE_LINK_PATHS = everyPublicSiteLink
  .filter((link) => !link.external)
  .map((link): [string, string] => [`publicSiteLinks ${link.label}`, link.href]);

describe('route builders and the URLs the app writes', () => {
  it.each([...ROUTE_BUILDER_PATHS, ...ORGANIZATION_ROUTE_BUILDER_PATHS, ...AUTH_PAGE_AND_API_LINKS, ...PUBLIC_SITE_LINK_PATHS])(
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

  it('checks every console route builder consoleRoutes.ts exports in an Organization too', () => {
    const builders = Object.keys(consoleRoutes).filter((name) => /^build\w*Path$/.test(name));
    const checked = new Set(ORGANIZATION_ROUTE_BUILDER_PATHS.map(([name]) => name.split(' ')[0]));
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
    const locs = [...`${urlset}${index}`.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => capturedGroup(match, 1));
    expect(locs).toEqual([
      'https://serplists.com/profile/alice/',
      'https://serplists.com/categories/seo/',
      'https://serplists.com/',
      'https://serplists.com/sitemaps/pages/1.xml',
    ]);
    for (const loc of locs) await expectServedAsIs(loc);
  });
});
