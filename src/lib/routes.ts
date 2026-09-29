import type { ChecklistTemplate } from '@/types/checklist';

import { resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';
import { categorySlug } from '@/lib/categorySlug';
import { canonicalPath } from '@/lib/http/urlStandard';
import { CANONICAL_ORIGIN } from '@/lib/seo/siteOrigin';

export { resolvePublicTemplateOwnerSlug };

export type AppShell = 'public' | 'console';
export type PublicRouteTier = 'marketing' | 'core' | 'secondary' | 'minimal';
export type ConsoleSection = 'home' | 'templates' | 'runs' | 'archive' | 'account';

// Every builder below returns a page's canonical path, with its trailing slash (the SERP URL
// standard, src/lib/http/urlStandard.ts). Link to these, never to a form that redirects.

// Paths from earlier versions of the app. next.config.ts redirects each to its page.
export const LEGACY_PUBLIC_LIBRARY_PATH = '/checklists';
export const LEGACY_ACCOUNT_PATH = '/account';
export const LEGACY_CONSOLE_HOME_PATH = '/console';
export const LEGACY_CONSOLE_PROFILE_PATH = '/dashboard/profile';
export const LEGACY_CONSOLE_TEMPLATES_PATH = '/console/templates';
export const LEGACY_CONSOLE_RUNS_PATH = '/console/runs';

// Canonical URLs (rel=canonical, og:url) always name the production site, also on staging
// and preview hosts. The sitemaps use the same origin (src/lib/seo/siteOrigin.ts).
export const SITE_ORIGIN = CANONICAL_ORIGIN;

export const buildSiteUrl = (path: string): string => new URL(path, SITE_ORIGIN).toString();

/**
 * A pathname as the router reports it (usePathname, location.pathname), in canonical form and
 * lower case, to compare with the builders below whichever form it came in.
 */
const routeKey = (pathname: string): string => canonicalPath(pathname.trim().toLowerCase());

/**
 * True when `pathname` is the page `href` names or a page under it, for highlighting the
 * navigation item that holds the current page. The home page only matches itself.
 */
export const isPathWithin = (pathname: string, href: string): boolean => {
  const path = routeKey(pathname);
  const target = routeKey(href);
  return path === target || (target !== '/' && path.startsWith(target));
};

export const buildHomePath = (): string => '/';

export const buildLoginPath = (): string => '/login/';

export const buildRegisterPath = (): string => '/register/';

export const buildForgotPasswordPath = (): string => '/forgot-password/';

export const buildResetPasswordPath = (): string => '/reset-password/';

export const buildPricingPath = (): string => '/pricing/';

export const buildAboutPath = (): string => '/about/';

export const buildContactPath = (): string => '/contact/';

export const buildPublicTemplatesPath = (): string => '/templates/';

export const isPublicTemplatesDiscoveryPath = (pathname: string): boolean =>
  routeKey(pathname) === buildPublicTemplatesPath();

// Unicode-aware and shared with the sitemap; see src/lib/categorySlug.ts.
export const buildCategorySlug = (categoryName: string): string =>
  categorySlug(categoryName);

// The slug may come from a URL, so it is normalized the same way as the names.
export const findCategoryNameBySlug = (
  categories: string[],
  slug: string,
): string | null => {
  const normalizedSlug = buildCategorySlug(slug);
  if (!normalizedSlug) return null;
  return (
    categories.find(
      (category) => buildCategorySlug(category) === normalizedSlug,
    ) ?? null
  );
};

// Category slugs from before accented letters were folded ('Café Guides' gave
// 'caf-guides'). Only used to send an already indexed URL to the current one.
const buildLegacyCategorySlug = (categoryName: string): string =>
  categoryName
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');

export const findCategoryNameByLegacySlug = (
  categories: string[],
  categorySlug: string,
): string | null => {
  const normalizedSlug = categorySlug.trim().toLowerCase();
  if (!normalizedSlug) return null;
  return (
    categories.find(
      (category) => buildLegacyCategorySlug(category) === normalizedSlug,
    ) ?? null
  );
};

export const buildPublicCategoriesPath = (): string => '/categories/';

export const buildPublicCategoryPathForSlug = (slug: string): string =>
  `/categories/${encodeURIComponent(slug)}/`;

// Null for a name with no letters or digits ('!!!', emoji only): it has no category page.
export const buildPublicCategoryPath = (categoryName: string): string | null => {
  const slug = buildCategorySlug(categoryName);
  return slug ? buildPublicCategoryPathForSlug(slug) : null;
};

export const resolveLegacyTemplatesCategoryRedirectPath = (
  searchParams: URLSearchParams,
): string | null => {
  const categorySlug = searchParams.get('category')?.trim();
  const hasOnlyCategoryParam = Array.from(searchParams.keys()).every(
    (key) => key === 'category',
  );

  if (!categorySlug || !hasOnlyCategoryParam) {
    return null;
  }

  return buildPublicCategoryPath(categorySlug);
};

export const buildPublicProfilePath = (username: string): string =>
  `/profile/${encodeURIComponent(username)}/`;

/**
 * The profile URL Account settings previews for the username field, or null while it is
 * empty. The saved username is linked as stored: one saved before usernames were
 * lowercased may be mixed case, and the lookup finds it only in that casing. An unsaved
 * edit previews the lowercase form the save will store.
 */
export const buildProfilePreviewPath = (
  formUsername: string,
  savedUsername: string | null | undefined,
): string | null => {
  const username = formUsername.trim();
  if (!username) {
    return null;
  }
  return buildPublicProfilePath(username === savedUsername ? username : username.toLowerCase());
};

/**
 * Usernames are stored lowercase and profile lookups ignore case, so
 * /profile/JohnDoe/ loads @johndoe. Returns the path to replace the URL with
 * when its casing differs from the stored username, or null.
 */
export const getCanonicalProfilePath = (
  routeUsername: string | undefined,
  storedUsername: string | null | undefined,
): string | null =>
  routeUsername && storedUsername && routeUsername !== storedUsername
    ? buildPublicProfilePath(storedUsername)
    : null;

export const buildPublicTemplatePath = (
  ownerSlug: string,
  templateSlug: string,
): string =>
  `/profile/${encodeURIComponent(ownerSlug)}/${encodeURIComponent(templateSlug)}/`;

export const buildPublicFeaturePath = (featureSlug: string): string =>
  `/features/${encodeURIComponent(featureSlug)}/`;

export const buildPublicFeaturesPath = (): string => '/features/';

export const buildSharePath = (shareToken: string): string =>
  `/share/${encodeURIComponent(shareToken)}/`;

export const buildCanonicalPublicTemplatePath = (
  template: Pick<ChecklistTemplate, 'id' | 'slug' | 'userId' | 'ownerProfile'>,
): string | null => {
  const ownerSlug = resolvePublicTemplateOwnerSlug(template);
  const templateSlug = template.slug?.trim() || template.id.trim();

  if (!ownerSlug || !templateSlug) {
    return null;
  }

  return buildPublicTemplatePath(ownerSlug, templateSlug);
};

// The only public template route is /profile/:username/:templateSlug/, so a template whose
// owner has no username has no public URL. Public discovery lists only templates that have one.
export const hasCanonicalPublicTemplatePath = (
  template: Pick<ChecklistTemplate, 'id' | 'slug' | 'userId' | 'ownerProfile'>,
): boolean => buildCanonicalPublicTemplatePath(template) !== null;

// Every dashboard page sits under this path. /dashboard/ itself is not a page: a typed or
// bookmarked /dashboard/ redirects (307, next.config.ts) to the dashboard's home.
export const DASHBOARD_PATH = '/dashboard/';

export const buildConsoleTemplatesPath = (): string => '/dashboard/templates/';

// The dashboard's home, My Templates for now. Links go straight to it, since no link may
// depend on a redirect; if the home moves, change it here and in next.config.ts.
export const buildConsoleHomePath = (): string => buildConsoleTemplatesPath();

export const buildConsoleTemplateCreatePath = (): string =>
  '/dashboard/templates/new/';

export const buildConsoleTemplateImportPath = (): string =>
  '/dashboard/import-templates/';

export const buildConsoleTemplatePath = (templateId: string): string =>
  `/dashboard/templates/${encodeURIComponent(templateId)}/`;

export const buildConsoleTemplateEditPath = (templateId: string): string =>
  `/dashboard/templates/${encodeURIComponent(templateId)}/edit/`;

export const buildConsoleRunsPath = (): string => '/dashboard/runs/';

export const buildConsoleRunPath = (runId: string): string =>
  `/dashboard/runs/${encodeURIComponent(runId)}/`;

export const buildRunPath = (runId: string): string =>
  `/run/${encodeURIComponent(runId)}/`;

export const buildRunUrl = (runId: string, origin: string): string =>
  new URL(buildRunPath(runId), origin).toString();

export const buildConsoleSettingsPath = (): string => '/dashboard/settings/';

export const buildConsoleArchivePath = (): string => '/dashboard/archive/';

export const isBlankTemplateEditorRoute = (pathname: string): boolean => {
  const path = routeKey(pathname);

  return (
    path === buildConsoleTemplateCreatePath() ||
    /^\/dashboard\/templates\/[^/]+\/edit\/$/.test(path) ||
    /^\/console\/templates\/[^/]+\/edit\/$/.test(path)
  );
};

export const resolveRouteShell = (pathname: string): AppShell => {
  const path = routeKey(pathname);

  if (
    path === routeKey(LEGACY_ACCOUNT_PATH) ||
    path.startsWith('/run/') ||
    path.startsWith(DASHBOARD_PATH) ||
    path.startsWith(routeKey(LEGACY_CONSOLE_HOME_PATH))
  ) {
    return 'console';
  }

  return 'public';
};

export const resolvePublicRouteTier = (pathname: string): PublicRouteTier => {
  const path = routeKey(pathname);

  if (path === buildHomePath()) {
    return 'marketing';
  }

  if (path.startsWith('/share/')) {
    return 'minimal';
  }

  if (
    path === buildPublicTemplatesPath() ||
    path === routeKey(LEGACY_PUBLIC_LIBRARY_PATH) ||
    path.startsWith('/profile/')
  ) {
    return 'core';
  }

  if (
    path.startsWith(buildPublicCategoriesPath()) ||
    path.startsWith(buildPublicFeaturesPath())
  ) {
    return 'secondary';
  }

  return 'marketing';
};

export const resolveConsoleSection = (
  pathname: string,
): ConsoleSection | null => {
  const path = routeKey(pathname);

  if (
    path === routeKey(LEGACY_ACCOUNT_PATH) ||
    path === buildConsoleSettingsPath() ||
    path === routeKey(LEGACY_CONSOLE_PROFILE_PATH)
  ) {
    return 'account';
  }

  if (path === DASHBOARD_PATH || path === routeKey(LEGACY_CONSOLE_HOME_PATH)) {
    return 'home';
  }

  if (
    path === buildConsoleTemplateImportPath() ||
    path.startsWith(buildConsoleTemplatesPath()) ||
    path.startsWith(routeKey(LEGACY_CONSOLE_TEMPLATES_PATH))
  ) {
    return 'templates';
  }

  if (path === buildConsoleArchivePath()) {
    return 'archive';
  }

  if (
    path.startsWith(buildConsoleRunsPath()) ||
    path.startsWith('/run/') ||
    path.startsWith(routeKey(LEGACY_CONSOLE_RUNS_PATH))
  ) {
    return 'runs';
  }

  return null;
};
