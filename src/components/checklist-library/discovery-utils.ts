import type { ChecklistTemplate } from '@/types/checklist';

import { uniqueCategoryNames } from '@/lib/categorySlug';
import { buildCategorySlug, findCategoryNameByLegacySlug } from '@/lib/routes';
import { countTemplateItems } from '@/lib/templates/templateItemCount';
import { getTemplateRecencyTime } from '@/lib/templates/templateRecency';

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

  const leftItemCount = countTemplateItems(left);
  const rightItemCount = countTemplateItems(right);

  if (rightItemCount !== leftItemCount) {
    return rightItemCount - leftItemCount;
  }

  return (
    getTemplateRecencyTime(right) - getTemplateRecencyTime(left) ||
    compareText(left.title, right.title)
  );
};

const compareByTrending = (
  left: ChecklistTemplate,
  right: ChecklistTemplate,
): number => {
  const leftItemCount = countTemplateItems(left);
  const rightItemCount = countTemplateItems(right);

  if (rightItemCount !== leftItemCount) {
    return rightItemCount - leftItemCount;
  }

  const leftUpdatedAt = getTemplateRecencyTime(left);
  const rightUpdatedAt = getTemplateRecencyTime(right);

  if (rightUpdatedAt !== leftUpdatedAt) {
    return rightUpdatedAt - leftUpdatedAt;
  }

  return compareByPopularity(left, right);
};

const compareByRecent = (
  left: ChecklistTemplate,
  right: ChecklistTemplate,
): number => {
  const leftUpdatedAt = getTemplateRecencyTime(left);
  const rightUpdatedAt = getTemplateRecencyTime(right);

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

export const findCategoryByLegacySlug = (
  categories: DiscoveryCategory[],
  slug: string,
): DiscoveryCategory | null => {
  if (!slug) return null;
  const renamed = categories.filter((category) => category.slug !== slug);
  const name = findCategoryNameByLegacySlug(renamed.map((category) => category.name), slug);
  return renamed.find((category) => category.name === name) ?? null;
};
