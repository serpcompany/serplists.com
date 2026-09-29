import React from 'react';
import { Clock, Star, TrendingUp } from 'lucide-react';

import { Button, buttonVariants } from '@/components/ui/button';
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
  // Where a category chip goes; without it, a chip filters in place.
  getCategoryPath?: (category: DiscoveryCategory) => string;
  onCategoryChange: (categorySlug: string | null) => void;
  selectedCategorySlug: string | null;
}

// The category chips: All, then each category. A chip with a category page links there.
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

// Popular, Trending and Recent.
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

interface SearchAndFiltersProps extends CategoryChipsProps, SortButtonsProps {
  resultCount: number;
  resultLabel?: string;
  searchSlot?: React.ReactNode;
  trailingControls?: React.ReactNode;
}

// The category chips above a toolbar: the search field (or the result count) on the left
// and the sort controls on the right.
export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  categories,
  onCategoryChange,
  onSortChange,
  resultCount,
  resultLabel,
  searchSlot,
  selectedCategorySlug,
  sortBy,
  getCategoryPath,
  trailingControls,
}) => (
  <section className="flex flex-col gap-6">
    {categories.length > 0 ? (
      <div className="flex items-center gap-2 overflow-x-auto pb-2">
        <CategoryChips
          categories={categories}
          getCategoryPath={getCategoryPath}
          onCategoryChange={onCategoryChange}
          selectedCategorySlug={selectedCategorySlug}
        />
      </div>
    ) : null}

    <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
      {searchSlot ? (
        searchSlot
      ) : (
        <p className="text-sm text-muted-foreground">
          {resultLabel ?? `${resultCount} templates`}
        </p>
      )}

      {trailingControls ?? <SortButtons onSortChange={onSortChange} sortBy={sortBy} />}
    </div>
  </section>
);
