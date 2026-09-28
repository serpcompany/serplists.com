import type { ChecklistTemplate } from '@/types/checklist';

import {
  REPO_TEMPLATE_OWNER_SLUG,
  REPO_TEMPLATE_USER_ID,
} from '@/lib/repoTemplateCatalog';
import { generateSlug } from '@/utils/urlHelpers';

export type AppShell = 'public' | 'console';
export type PublicRouteTier = 'marketing' | 'core' | 'secondary' | 'minimal';
export type ConsoleSection = 'home' | 'templates' | 'runs' | 'account';

export const LEGACY_PUBLIC_LIBRARY_PATH = '/checklists';
export const LEGACY_ACCOUNT_PATH = '/account';
export const LEGACY_CONSOLE_HOME_PATH = '/console';
export const LEGACY_CONSOLE_PROFILE_PATH = '/dashboard/profile';
export const LEGACY_CONSOLE_TEMPLATES_PATH = '/console/templates';
export const LEGACY_CONSOLE_RUNS_PATH = '/console/runs';

export const buildPublicTemplatesPath = (): string => '/templates';

export const isPublicTemplatesDiscoveryPath = (pathname: string): boolean => {
  const normalizedPath = pathname.trim().toLowerCase();

  return (
    normalizedPath === buildPublicTemplatesPath() ||
    normalizedPath === `${buildPublicTemplatesPath()}/`
  );
};

export const buildCategorySlug = (categoryName: string): string =>
  generateSlug(categoryName.trim());

export const findCategoryNameBySlug = (
  categories: string[],
  categorySlug: string,
): string | null => {
  const normalizedSlug = categorySlug.trim().toLowerCase();
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

export const buildPublicCategoriesPath = (): string => '/categories';

export const buildPublicCategoryPath = (categoryName: string): string =>
  `/categories/${encodeURIComponent(buildCategorySlug(categoryName) || categoryName.trim().toLowerCase())}`;

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
    normalizedPath.startsWith(buildConsoleRunsPath()) ||
    normalizedPath.startsWith('/run/') ||
    normalizedPath.startsWith(LEGACY_CONSOLE_RUNS_PATH)
  ) {
    return 'runs';
  }

  return null;
};

export const resolvePublicTemplateOwnerSlug = (
  template: Pick<ChecklistTemplate, 'id' | 'userId' | 'ownerProfile'>,
): string | null => {
  const username = template.ownerProfile?.username?.trim();

  if (username) {
    return username;
  }

  if (
    template.userId === REPO_TEMPLATE_USER_ID ||
    template.id.startsWith('repo:')
  ) {
    return REPO_TEMPLATE_OWNER_SLUG;
  }

  return null;
};
