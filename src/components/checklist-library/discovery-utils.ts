import type { ChecklistTemplate } from '@/types/checklist';

import { uniqueCategoryNames } from '@/lib/categorySlug';
import { buildCategorySlug } from '@/lib/routes';
import { generateSlug } from '@/utils/urlHelpers';

export type DiscoverySort = 'popular' | 'trending' | 'recent';

export type DiscoveryCategory = {
  count: number;
  name: string;
  slug: string;
};

const normalizeQuery = (query: string): string => query.trim().toLowerCase();

export const getTemplateSectionCount = (
  template: ChecklistTemplate,
): number =>
  template.sections.length;

export const getTemplateItemCount = (template: ChecklistTemplate): number =>
  template.sections.reduce((total, section) => total + section.items.length, 0);

export const getTemplateOwnerLabel = (
  template: ChecklistTemplate,
): string => template.ownerProfile?.full_name ?? template.ownerProfile?.username ?? 'Community';

const getTemplateSearchText = (template: ChecklistTemplate): string =>
  [
    template.title,
    template.description ?? '',
    template.tags?.join(' ') ?? '',
    template.categories?.join(' ') ?? '',
  ]
    .join(' ')
    .toLowerCase();

const compareText = (a: string, b: string): number =>
  a.localeCompare(b, undefined, { sensitivity: 'base' });

const compareByPopularity = (
  left: ChecklistTemplate,
  right: ChecklistTemplate,
): number => {
  const leftSectionCount = getTemplateSectionCount(left);
  const rightSectionCount = getTemplateSectionCount(right);

  if (rightSectionCount !== leftSectionCount) {
    return rightSectionCount - leftSectionCount;
  }

  const leftItemCount = getTemplateItemCount(left);
  const rightItemCount = getTemplateItemCount(right);

  if (rightItemCount !== leftItemCount) {
    return rightItemCount - leftItemCount;
  }

  return (
    new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime() ||
    compareText(left.title, right.title)
  );
};

const compareByTrending = (
  left: ChecklistTemplate,
  right: ChecklistTemplate,
): number => {
  const leftItemCount = getTemplateItemCount(left);
  const rightItemCount = getTemplateItemCount(right);

  if (rightItemCount !== leftItemCount) {
    return rightItemCount - leftItemCount;
  }

  const leftUpdatedAt = new Date(left.updatedAt).getTime();
  const rightUpdatedAt = new Date(right.updatedAt).getTime();

  if (rightUpdatedAt !== leftUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return compareByPopularity(left, right);
};

const compareByRecent = (
  left: ChecklistTemplate,
  right: ChecklistTemplate,
): number => {
  const leftUpdatedAt = new Date(left.updatedAt).getTime();
  const rightUpdatedAt = new Date(right.updatedAt).getTime();

  if (rightUpdatedAt !== leftUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return compareText(left.title, right.title);
};

export const filterAndSortTemplates = (
  templates: ChecklistTemplate[],
  {
    categorySlug,
    searchQuery,
    sortBy,
  }: {
    categorySlug?: string | null;
    searchQuery?: string;
    sortBy: DiscoverySort;
  },
): ChecklistTemplate[] => {
  const normalizedQuery = normalizeQuery(searchQuery ?? '');
  // No category means no filter. A category that slugs to '' ('!!!') matches nothing.
  const normalizedCategorySlug = categorySlug?.trim() ? buildCategorySlug(categorySlug) : null;

  const filtered = templates.filter((template) => {
    const matchesSearch =
      normalizedQuery.length === 0 ||
      getTemplateSearchText(template).includes(normalizedQuery);

    const matchesCategory =
      normalizedCategorySlug === null ||
      (normalizedCategorySlug !== '' &&
        template.categories?.some(
          (category) => buildCategorySlug(category) === normalizedCategorySlug,
        ) === true);

    return matchesSearch && matchesCategory;
  });

  const comparator =
    sortBy === 'recent'
      ? compareByRecent
      : sortBy === 'trending'
        ? compareByTrending
        : compareByPopularity;

  return [...filtered].sort(comparator);
};

export const buildDiscoveryCategories = (
  templates: ChecklistTemplate[],
  categories?: string[],
): DiscoveryCategory[] => {
  const categoryCountsBySlug = new Map<string, number>();
  const categoryLabelBySlug = new Map<string, string>();

  // A name with no letters or digits has no category page, so it gets no entry
  // (they used to merge into one '' entry that linked to a 404). A template that lists a
  // category twice ('SEO' and 'seo') counts once, as the category page lists it once.
  templates.forEach((template) => {
    uniqueCategoryNames(template.categories ?? []).forEach((category) => {
      const slug = buildCategorySlug(category);
      if (!slug) return;
      categoryCountsBySlug.set(slug, (categoryCountsBySlug.get(slug) ?? 0) + 1);
      if (!categoryLabelBySlug.has(slug)) {
        categoryLabelBySlug.set(slug, category);
      }
    });
  });

  const sourceCategories =
    categories ?? Array.from(categoryLabelBySlug.values()).sort(compareText);
  const categoriesBySlug = new Map<string, DiscoveryCategory>();

  sourceCategories.forEach((name) => {
    const slug = buildCategorySlug(name);
    if (!slug || categoriesBySlug.has(slug)) {
      return;
    }

    categoriesBySlug.set(slug, {
      count: categoryCountsBySlug.get(slug) ?? 0,
      name: categoryLabelBySlug.get(slug) ?? name,
      slug,
    });
  });

  return Array.from(categoriesBySlug.values())
    .filter((category) => category.count > 0)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return compareText(left.name, right.name);
    });
};

// Category slugs used to keep only ASCII letters and digits ('Café Culture' was
// 'caf-culture'). Returns the category an old link or sitemap entry like that meant, so
// the page can redirect to its current slug.
export const findCategoryByLegacySlug = (
  categories: DiscoveryCategory[],
  slug: string,
): DiscoveryCategory | null => {
  if (!slug) return null;
  return (
    categories.find(
      (category) => category.slug !== slug && generateSlug(category.name.trim()) === slug,
    ) ?? null
  );
};
