import { APP_BRAND_NAME } from './brand';
import { formatCount } from './utils/pluralize';

export const SITE_SOCIAL_IMAGE = {
  path: '/og-default.png',
  width: 1200,
  height: 630,
  alt: APP_BRAND_NAME,
} as const;

export const TEMPLATE_LIBRARY_PAGE_TEXT = {
  title: 'Template Library',
  description: 'Browse hundreds of ready-to-use checklist templates created by the community.',
} as const;

export const CATEGORY_INDEX_PAGE_TEXT = {
  title: 'Browse Template Categories',
  description: 'Explore checklist templates organized by category.',
} as const;

export const TEMPLATE_NOT_FOUND_PAGE_TEXT = {
  title: 'Template not found',
  description: 'The template you are looking for does not exist or is no longer public.',
} as const;

export const PROFILE_NOT_FOUND_PAGE_TEXT = {
  title: 'Profile not found',
  description: 'This profile does not exist.',
} as const;

export const buildCategoryPageTitle = (categoryName: string): string => `${categoryName} Templates`;

export const describeCategoryPage = (
  category: { name: string; description: string },
  loadedTemplateCount: number | null,
): string =>
  loadedTemplateCount === null
    ? `Templates for ${category.name}. ${category.description}`
    : `${formatCount(loadedTemplateCount, 'template')} for ${category.name}. ${category.description}`;

export const describeUnlistedCategory = (categoryName: string): string =>
  `Templates filed under ${categoryName}.`;

export interface TemplatePageSource {
  title: string;
  description?: string | null;
  seoTitle?: string | null;
  seoDescription?: string | null;
}

export const resolveTemplatePageText = (
  template: TemplatePageSource,
): { title: string; description: string } => ({
  title: template.seoTitle?.trim() || template.title,
  description:
    template.seoDescription?.trim() ||
    template.description?.trim() ||
    `${template.title} - Interactive checklist template`,
});
