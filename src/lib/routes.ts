import type { ChecklistTemplate } from '@/types/checklist';

import { resolvePublicTemplateOwnerSlug } from '@/lib/repoTemplateCatalog';
import { categorySlug } from '@/lib/categorySlug';
import { canonicalPath } from '@/lib/http/urlStandard';
import { parseConsoleRoute } from '@/lib/consoleRoutes';

export { resolvePublicTemplateOwnerSlug };

export type AppShell = 'public' | 'console';
export type PublicRouteTier = 'marketing' | 'core' | 'secondary' | 'minimal';

const LEGACY_PUBLIC_LIBRARY_PATH = '/checklists';
const LEGACY_ACCOUNT_PATH = '/account';
const LEGACY_CONSOLE_HOME_PATH = '/console';

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

type PublicTemplateUrlFields = Pick<
  ChecklistTemplate,
  'id' | 'slug' | 'userId' | 'ownerProfile' | 'owner' | 'ownerType' | 'teamId'
>;

export const buildCanonicalPublicTemplatePath = (template: PublicTemplateUrlFields): string | null => {
  const ownerSlug = resolvePublicTemplateOwnerSlug(template);
  const templateSlug = template.slug?.trim() || template.id.trim();

  if (!ownerSlug || !templateSlug) {
    return null;
  }

  return buildPublicTemplatePath(ownerSlug, templateSlug);
};

export const buildCanonicalPublicTemplateRunPath = (template: PublicTemplateUrlFields): string | null => {
  const templatePath = buildCanonicalPublicTemplatePath(template);
  return templatePath ? `${templatePath}run/` : null;
};

export const hasCanonicalPublicTemplatePath = (template: PublicTemplateUrlFields): boolean =>
  buildCanonicalPublicTemplatePath(template) !== null;

export const DASHBOARD_PATH = '/dashboard/';

export {
  buildConsoleArchivePath,
  buildConsoleHomePath,
  buildConsoleRunPath,
  buildConsoleRunsPath,
  buildConsoleSettingsPath,
  buildConsoleTemplateCreatePath,
  buildConsoleTemplateEditPath,
  buildConsoleTemplateImportPath,
  buildConsoleTemplatePath,
  buildConsoleTemplatesPath,
} from '@/lib/consoleRoutes';

const LEGACY_TEMPLATE_EDITOR_PATH = /^\/console\/templates\/[^/]+\/edit\/$/;

export const isBlankTemplateEditorRoute = (pathname: string): boolean => {
  const section = parseConsoleRoute(pathname)?.section.name;
  return (
    section === 'template-create' ||
    section === 'template-edit' ||
    LEGACY_TEMPLATE_EDITOR_PATH.test(comparablePath(pathname))
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
