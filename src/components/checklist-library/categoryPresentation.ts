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

export const getCategoryIcon = (slug: string): ElementType =>
  CATEGORY_ICONS.get(slug) ?? DEFAULT_CATEGORY_ICON;

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
