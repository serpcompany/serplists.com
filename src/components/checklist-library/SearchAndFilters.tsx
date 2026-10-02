import React from 'react';
import { Clock, Star, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { buttonVariants } from '@/components/ui/button-variants';
import { cn } from '@/lib/utils';
import type {
  DiscoveryCategory,
  DiscoverySort,
} from '@/components/checklist-library/discovery-utils';

import { Link } from '@/components/navigation/Link';

const sortOptions: Array<{
  icon: typeof Star;
  label: string;
  value: DiscoverySort;
}> = [
  { icon: Star, label: 'Popular', value: 'popular' },
  { icon: TrendingUp, label: 'Trending', value: 'trending' },
  { icon: Clock, label: 'Recent', value: 'recent' },
];

interface CategoryChipsProps {
  categories: DiscoveryCategory[];
  getCategoryPath?: (category: DiscoveryCategory) => string;
  onCategoryChange: (categorySlug: string | null) => void;
  selectedCategorySlug: string | null;
}

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  categories,
  getCategoryPath,
  onCategoryChange,
  selectedCategorySlug,
}) => {
  if (categories.length === 0) return null;

  const chipClassName = (active: boolean) =>
    cn(buttonVariants({ variant: active ? 'default' : 'secondary', size: 'sm' }), 'shrink-0');

  return (
    <>
      <Button
        type="button"
        className={chipClassName(selectedCategorySlug === null)}
        onClick={() => onCategoryChange(null)}
      >
        All
      </Button>

      {categories.map((category) => {
        const isActive = selectedCategorySlug === category.slug;
        const categoryPath = getCategoryPath?.(category);

        if (categoryPath) {
          return (
            <Link key={category.slug} href={categoryPath} className={chipClassName(isActive)}>
              {category.name}
            </Link>
          );
        }

        return (
          <Button
            key={category.slug}
            type="button"
            className={chipClassName(isActive)}
            onClick={() => onCategoryChange(category.slug)}
          >
            {category.name}
          </Button>
        );
      })}
    </>
  );
};

interface SortButtonsProps {
  onSortChange: (sortBy: DiscoverySort) => void;
  sortBy: DiscoverySort;
}

export const SortButtons: React.FC<SortButtonsProps> = ({ onSortChange, sortBy }) => (
  <div className="flex items-center gap-1">
    {sortOptions.map((option) => {
      const Icon = option.icon;
      const isActive = sortBy === option.value;

      return (
        <Button
          key={option.value}
          type="button"
          variant={isActive ? 'secondary' : 'ghost'}
          size="sm"
          aria-pressed={isActive}
          onClick={() => onSortChange(option.value)}
          className={cn(!isActive && 'text-muted-foreground')}
        >
          <Icon data-icon="inline-start" />
          {option.label}
        </Button>
      );
    })}
  </div>
);
