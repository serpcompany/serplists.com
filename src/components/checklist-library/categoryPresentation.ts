import type { ElementType } from 'react';
import {
  Briefcase,
  Code,
  FileText,
  Heart,
  Layers,
  Paintbrush,
  TrendingUp,
  Users,
  Zap,
} from 'lucide-react';

import { PUBLIC_CATEGORY_REGISTRY } from '@/data/publicCategories';
import { describeUnlistedCategory } from '@/lib/publicPageMeta';

export interface CategoryPresentation {
  description: string;
  icon: ElementType;
  name: string;
}

const DEFAULT_CATEGORY_ICON: ElementType = FileText;

// A Map, not an object literal: the slug comes from the URL, and indexing a plain
// object with 'constructor' or '__proto__' returns an Object.prototype member. Icon tiles
// are neutral (no color per category).
const CATEGORY_ICONS = new Map<string, ElementType>([
  ['business', Briefcase],
  ['engineering', Code],
  ['design', Paintbrush],
  ['marketing', TrendingUp],
  ['hr', Users],
  ['personal', Heart],
  ['productivity', Zap],
  ['project-management', Layers],
  ['compliance', DEFAULT_CATEGORY_ICON],
]);

/** The icon of a category: its built-in one, or the default for any other category. */
export const getCategoryIcon = (slug: string): ElementType =>
  CATEGORY_ICONS.get(slug) ?? DEFAULT_CATEGORY_ICON;

/**
 * How a category page presents itself, or null when the slug is neither a built-in
 * category nor one that a public template uses (the page then renders NotFound).
 */
export const resolveCategoryPresentation = (
  slug: string,
  categoryStats: { name: string } | undefined,
): CategoryPresentation | null => {
  const canonical = PUBLIC_CATEGORY_REGISTRY.find((item) => item.slug === slug);
  if (canonical) {
    return {
      description: canonical.description,
      icon: getCategoryIcon(slug),
      name: canonical.name,
    };
  }

  if (!categoryStats) return null;

  return {
    description: describeUnlistedCategory(categoryStats.name),
    icon: DEFAULT_CATEGORY_ICON,
    name: categoryStats.name,
  };
};
