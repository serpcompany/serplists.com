import React from 'react';
import { Clock, Star, TrendingUp } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import type {
  DiscoveryCategory,
  DiscoverySort,
} from '@/components/checklist-library/discovery-utils';

interface SearchAndFiltersProps {
  categories: DiscoveryCategory[];
  onCategoryChange: (categorySlug: string | null) => void;
  onSortChange: (sortBy: DiscoverySort) => void;
  resultCount: number;
  searchSlot?: React.ReactNode;
  selectedCategorySlug: string | null;
  sortBy: DiscoverySort;
  trailingControls?: React.ReactNode;
}

const sortOptions: Array<{
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: DiscoverySort;
}> = [
  { icon: Star, label: 'Popular', value: 'popular' },
  { icon: TrendingUp, label: 'Trending', value: 'trending' },
  { icon: Clock, label: 'Recent', value: 'recent' },
];

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  categories,
  onCategoryChange,
  onSortChange,
  resultCount,
  searchSlot,
  selectedCategorySlug,
  sortBy,
  trailingControls,
}) => {
  const sortControls = trailingControls ?? (
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
            onClick={() => onSortChange(option.value)}
            className={cn('gap-1.5', !isActive && 'text-muted-foreground')}
          >
            <Icon className="h-3.5 w-3.5" />
            {option.label}
          </Button>
        );
      })}
    </div>
  );

  return (
    <section className="space-y-6">
      {categories.length > 0 ? (
        <div className="flex items-center gap-2 overflow-x-auto pb-2">
          <Button
            type="button"
            variant={selectedCategorySlug === null ? 'default' : 'outline'}
            size="sm"
            onClick={() => onCategoryChange(null)}
            className="shrink-0"
          >
            All
          </Button>

          {categories.map((category) => {
            const isActive = selectedCategorySlug === category.slug;

            return (
              <Button
                key={category.slug}
                type="button"
                variant={isActive ? 'default' : 'outline'}
                size="sm"
                onClick={() => onCategoryChange(category.slug)}
                className="shrink-0"
              >
                {category.name}
              </Button>
            );
          })}
        </div>
      ) : null}

      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        {searchSlot ? (
          searchSlot
        ) : (
          <p className="text-sm text-muted-foreground">{resultCount} templates</p>
        )}

        {sortControls}
      </div>
    </section>
  );
};
