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
  bgColor: string;
  color: string;
  description: string;
  icon: ElementType;
  name: string;
}

type CategoryStyle = Pick<CategoryPresentation, 'bgColor' | 'color' | 'icon'>;

const DEFAULT_CATEGORY_STYLE: CategoryStyle = {
  bgColor: 'bg-slate-500/10',
  color: 'text-slate-400',
  icon: FileText,
};

// A Map, not an object literal: the slug comes from the URL, and indexing a plain
// object with 'constructor' or '__proto__' returns an Object.prototype member.
const CATEGORY_STYLES = new Map<string, CategoryStyle>([
  ['business', { bgColor: 'bg-blue-500/10', color: 'text-blue-400', icon: Briefcase }],
  ['engineering', { bgColor: 'bg-emerald-500/10', color: 'text-emerald-400', icon: Code }],
  ['design', { bgColor: 'bg-pink-500/10', color: 'text-pink-400', icon: Paintbrush }],
  ['marketing', { bgColor: 'bg-orange-500/10', color: 'text-orange-400', icon: TrendingUp }],
  ['hr', { bgColor: 'bg-cyan-500/10', color: 'text-cyan-400', icon: Users }],
  ['personal', { bgColor: 'bg-rose-500/10', color: 'text-rose-400', icon: Heart }],
  ['productivity', { bgColor: 'bg-yellow-500/10', color: 'text-yellow-400', icon: Zap }],
  ['project-management', { bgColor: 'bg-indigo-500/10', color: 'text-indigo-400', icon: Layers }],
  ['compliance', DEFAULT_CATEGORY_STYLE],
]);

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
      ...(CATEGORY_STYLES.get(slug) ?? DEFAULT_CATEGORY_STYLE),
      description: canonical.description,
      name: canonical.name,
    };
  }

  if (!categoryStats) return null;

  return {
    ...DEFAULT_CATEGORY_STYLE,
    description: describeUnlistedCategory(categoryStats.name),
    name: categoryStats.name,
  };
};
