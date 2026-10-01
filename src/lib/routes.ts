import type { ChecklistTemplate } from '@/types/checklist';

import { resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';
import { categorySlug } from '@/lib/categorySlug';
import { canonicalPath } from '@/lib/http/urlStandard';
import { CANONICAL_ORIGIN } from '@/lib/seo/siteOrigin';

export { resolvePublicTemplateOwnerSlug };

export type AppShell = 'public' | 'console';
export type PublicRouteTier = 'marketing' | 'core' | 'secondary' | 'minimal';
export type ConsoleSection = 'home' | 'templates' | 'runs' | 'archive' | 'account';

export const LEGACY_PUBLIC_LIBRARY_PATH = '/checklists';
export const LEGACY_ACCOUNT_PATH = '/account';
export const LEGACY_CONSOLE_HOME_PATH = '/console';
export const LEGACY_CONSOLE_PROFILE_PATH = '/dashboard/profile';
export const LEGACY_CONSOLE_TEMPLATES_PATH = '/console/templates';
export const LEGACY_CONSOLE_RUNS_PATH = '/console/runs';

export const SITE_ORIGIN = CANONICAL_ORIGIN;

export const buildSiteUrl = (path: string): string => new URL(path, SITE_ORIGIN).toString();

const comparablePath = (pathname: string): string => canonicalPath(pathname.trim().toLowerCase());

export const isPathWithin = (pathname: string, href: string): boolean => {
  const path = comparablePath(pathname);
  const target = comparablePath(href);
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
  comparablePath(pathname) === buildPublicTemplatesPath();

export const buildCategorySlug = (categoryName: string): string =>
  categorySlug(categoryName);

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

export const hasCanonicalPublicTemplatePath = (
  template: Pick<ChecklistTemplate, 'id' | 'slug' | 'userId' | 'ownerProfile'>,
): boolean => buildCanonicalPublicTemplatePath(template) !== null;

export const DASHBOARD_PATH = '/dashboard/';

export const buildConsoleTemplatesPath = (): string => '/dashboard/templates/';

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

export const buildConsoleSettingsPath = (): string => '/dashboard/settings/';

export const buildConsoleArchivePath = (): string => '/dashboard/archive/';

export const isBlankTemplateEditorRoute = (pathname: string): boolean => {
  const path = comparablePath(pathname);

  return (
    path === buildConsoleTemplateCreatePath() ||
    /^\/dashboard\/templates\/[^/]+\/edit\/$/.test(path) ||
    /^\/console\/templates\/[^/]+\/edit\/$/.test(path)
  );
};

export const resolveRouteShell = (pathname: string): AppShell => {
  const path = comparablePath(pathname);

  if (
    path === comparablePath(LEGACY_ACCOUNT_PATH) ||
    path.startsWith(DASHBOARD_PATH) ||
    path.startsWith(comparablePath(LEGACY_CONSOLE_HOME_PATH))
  ) {
    return 'console';
  }

  return 'public';
};

export const resolvePublicRouteTier = (pathname: string): PublicRouteTier => {
  const path = comparablePath(pathname);

  if (path === buildHomePath()) {
    return 'marketing';
  }

  if (path.startsWith('/share/')) {
    return 'minimal';
  }

  if (
    path === buildPublicTemplatesPath() ||
    path === comparablePath(LEGACY_PUBLIC_LIBRARY_PATH) ||
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
  const path = comparablePath(pathname);

  if (
    path === comparablePath(LEGACY_ACCOUNT_PATH) ||
    path === buildConsoleSettingsPath() ||
    path === comparablePath(LEGACY_CONSOLE_PROFILE_PATH)
  ) {
    return 'account';
  }

  if (path === DASHBOARD_PATH || path === comparablePath(LEGACY_CONSOLE_HOME_PATH)) {
    return 'home';
  }

  if (
    path === buildConsoleTemplateImportPath() ||
    path.startsWith(buildConsoleTemplatesPath()) ||
    path.startsWith(comparablePath(LEGACY_CONSOLE_TEMPLATES_PATH))
  ) {
    return 'templates';
  }

  if (path === buildConsoleArchivePath()) {
    return 'archive';
  }

  if (
    path.startsWith(buildConsoleRunsPath()) ||
    path.startsWith(comparablePath(LEGACY_CONSOLE_RUNS_PATH))
  ) {
    return 'runs';
  }

  return null;
};
