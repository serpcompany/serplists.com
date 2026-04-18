import type { ChecklistTemplate } from '@/types/checklist';

import { buildCategorySlug } from '@/lib/routes';

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
  const normalizedCategorySlug = normalizeQuery(categorySlug ?? '');

  const filtered = templates.filter((template) => {
    const matchesSearch =
      normalizedQuery.length === 0 ||
      getTemplateSearchText(template).includes(normalizedQuery);

    const matchesCategory =
      normalizedCategorySlug.length === 0 ||
      template.categories?.some(
        (category) => buildCategorySlug(category) === normalizedCategorySlug,
      ) === true;

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
  const categoryCounts = new Map<string, number>();

  templates.forEach((template) => {
    template.categories?.forEach((category) => {
      categoryCounts.set(category, (categoryCounts.get(category) ?? 0) + 1);
    });
  });

  const sourceCategories =
    categories ?? Array.from(categoryCounts.keys()).sort(compareText);

  return sourceCategories
    .map((name) => ({
      count: categoryCounts.get(name) ?? 0,
      name,
      slug: buildCategorySlug(name),
    }))
    .filter((category) => category.count > 0)
    .sort((left, right) => {
      if (right.count !== left.count) {
        return right.count - left.count;
      }

      return compareText(left.name, right.name);
    });
};
