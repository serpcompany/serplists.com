import type { ChecklistTemplate } from '@/types/checklist';

import { resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';
import { categorySlug } from '@/lib/categorySlug';

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

// Canonical URLs (rel=canonical, og:url) always name the production site, also on staging
// and preview hosts. The sitemaps use the same origin (CANONICAL_ORIGIN in
// functions/sitemap/shared.ts).
export const SITE_ORIGIN = 'https://serplists.com';

export const buildSiteUrl = (path: string): string => new URL(path, SITE_ORIGIN).toString();

export const buildPublicTemplatesPath = (): string => '/templates';

export const isPublicTemplatesDiscoveryPath = (pathname: string): boolean => {
  const normalizedPath = pathname.trim().toLowerCase();

  return (
    normalizedPath === buildPublicTemplatesPath() ||
    normalizedPath === `${buildPublicTemplatesPath()}/`
  );
};

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

export const buildPublicCategoriesPath = (): string => '/categories';

export const buildPublicCategoryPathForSlug = (slug: string): string =>
  `/categories/${encodeURIComponent(slug)}`;

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
  `/profile/${encodeURIComponent(username)}`;

export const buildPublicTemplatePath = (
  ownerSlug: string,
  templateSlug: string,
): string =>
  `/profile/${encodeURIComponent(ownerSlug)}/${encodeURIComponent(templateSlug)}`;

export const buildPublicFeaturePath = (featureSlug: string): string =>
  `/features/${encodeURIComponent(featureSlug)}`;

export const buildPublicFeaturesPath = (): string => '/features';

export const buildSharePath = (shareToken: string): string =>
  `/share/${encodeURIComponent(shareToken)}`;

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

// The only public template route is /profile/:username/:templateSlug, so a template whose
// owner has no username has no public URL. Public discovery lists only templates that have one.
export const hasCanonicalPublicTemplatePath = (
  template: Pick<ChecklistTemplate, 'id' | 'slug' | 'userId' | 'ownerProfile'>,
): boolean => buildCanonicalPublicTemplatePath(template) !== null;

export const buildConsoleHomePath = (): string => '/dashboard';

export const buildConsoleTemplatesPath = (): string => '/dashboard/templates';

export const buildConsoleTemplateCreatePath = (): string =>
  '/dashboard/templates/new';

export const buildConsoleTemplateImportPath = (): string =>
  '/dashboard/import-templates';

export const buildConsoleTemplatePath = (templateId: string): string =>
  `/dashboard/templates/${encodeURIComponent(templateId)}`;

export const buildConsoleTemplateEditPath = (templateId: string): string =>
  `/dashboard/templates/${encodeURIComponent(templateId)}/edit`;

export const buildConsoleRunsPath = (): string => '/dashboard/runs';

export const buildConsoleRunPath = (runId: string): string =>
  `/dashboard/runs/${encodeURIComponent(runId)}`;

export const buildRunPath = (runId: string): string =>
  `/run/${encodeURIComponent(runId)}`;

export const buildRunUrl = (runId: string, origin: string): string =>
  new URL(buildRunPath(runId), origin).toString();

export const buildConsoleSettingsPath = (): string => '/dashboard/settings';

export const buildConsoleArchivePath = (): string => '/dashboard/archive';

export const isBlankTemplateEditorRoute = (pathname: string): boolean => {
  const normalizedPath = pathname.trim().toLowerCase();

  return (
    normalizedPath === buildConsoleTemplateCreatePath() ||
    /^\/dashboard\/templates\/[^/]+\/edit$/.test(normalizedPath) ||
    /^\/console\/templates\/[^/]+\/edit$/.test(normalizedPath)
  );
};

export const resolveRouteShell = (pathname: string): AppShell => {
  const normalizedPath = pathname.trim().toLowerCase();

  if (
    normalizedPath === LEGACY_ACCOUNT_PATH ||
    normalizedPath.startsWith('/run/') ||
    normalizedPath.startsWith(buildConsoleHomePath()) ||
    normalizedPath.startsWith(LEGACY_CONSOLE_HOME_PATH)
  ) {
    return 'console';
  }

  return 'public';
};

export const resolvePublicRouteTier = (pathname: string): PublicRouteTier => {
  const normalizedPath = pathname.trim().toLowerCase();
  const isPublicTemplateDetailPath = /^\/profile\/[^/]+\/[^/]+$/.test(
    normalizedPath,
  );

  if (normalizedPath === '/') {
    return 'marketing';
  }

  if (normalizedPath.startsWith('/share/')) {
    return 'minimal';
  }

  if (
    normalizedPath === buildPublicTemplatesPath() ||
    normalizedPath === LEGACY_PUBLIC_LIBRARY_PATH ||
    normalizedPath.startsWith('/profile/') ||
    isPublicTemplateDetailPath
  ) {
    return 'core';
  }

  if (
    normalizedPath === '/categories' ||
    normalizedPath.startsWith('/categories/') ||
    normalizedPath === '/features' ||
    normalizedPath.startsWith('/features/')
  ) {
    return 'secondary';
  }

  return 'marketing';
};

export const resolveConsoleSection = (
  pathname: string,
): ConsoleSection | null => {
  const normalizedPath = pathname.trim().toLowerCase();

  if (normalizedPath === LEGACY_ACCOUNT_PATH) {
    return 'account';
  }

  if (
    normalizedPath === buildConsoleSettingsPath() ||
    normalizedPath === `${buildConsoleSettingsPath()}/` ||
    normalizedPath === LEGACY_CONSOLE_PROFILE_PATH ||
    normalizedPath === `${LEGACY_CONSOLE_PROFILE_PATH}/`
  ) {
    return 'account';
  }

  if (
    normalizedPath === buildConsoleHomePath() ||
    normalizedPath === `${buildConsoleHomePath()}/` ||
    normalizedPath === LEGACY_CONSOLE_HOME_PATH ||
    normalizedPath === `${LEGACY_CONSOLE_HOME_PATH}/`
  ) {
    return 'home';
  }

  if (
    normalizedPath === buildConsoleTemplateImportPath() ||
    normalizedPath === `${buildConsoleTemplateImportPath()}/`
  ) {
    return 'templates';
  }

  if (
    normalizedPath.startsWith(buildConsoleTemplatesPath()) ||
    normalizedPath.startsWith(LEGACY_CONSOLE_TEMPLATES_PATH)
  ) {
    return 'templates';
  }

  if (
    normalizedPath === buildConsoleArchivePath() ||
    normalizedPath === `${buildConsoleArchivePath()}/`
  ) {
    return 'archive';
  }

  if (
    normalizedPath.startsWith(buildConsoleRunsPath()) ||
    normalizedPath.startsWith('/run/') ||
    normalizedPath.startsWith(LEGACY_CONSOLE_RUNS_PATH)
  ) {
    return 'runs';
  }

  return null;
};
