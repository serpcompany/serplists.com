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
  selectedCategorySlug: string | null;
  sortBy: DiscoverySort;
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
  selectedCategorySlug,
  sortBy,
}) => {
  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3 text-sm text-muted-foreground">
        <p className="font-medium text-foreground">{resultCount} templates</p>

        <div className="flex items-center gap-1">
          {sortOptions.map((option) => {
            const Icon = option.icon;
            const isActive = sortBy === option.value;

            return (
              <Button
                key={option.value}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => onSortChange(option.value)}
                className={cn(
                  'gap-1.5 rounded-md border border-transparent px-3 text-sm text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
                  isActive &&
                    'border-border bg-secondary/60 text-foreground hover:bg-secondary/60',
                )}
              >
                <Icon className="h-3.5 w-3.5" />
                {option.label}
              </Button>
            );
          })}
        </div>
      </div>

      <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => onCategoryChange(null)}
          className={cn(
            'shrink-0 rounded-md border border-border/80 bg-secondary/20 px-4 text-sm text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
            selectedCategorySlug === null &&
              'border-transparent bg-background text-foreground shadow-sm',
          )}
        >
          All
        </Button>

        {categories.map((category) => {
          const isActive = selectedCategorySlug === category.slug;

          return (
            <Button
              key={category.slug}
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onCategoryChange(category.slug)}
              className={cn(
                'shrink-0 rounded-md border border-border/80 bg-secondary/20 px-4 text-sm text-muted-foreground hover:border-border hover:bg-secondary/40 hover:text-foreground',
                isActive &&
                  'border-transparent bg-background text-foreground shadow-sm',
              )}
            >
              {category.name}
            </Button>
          );
        })}
      </div>
    </section>
  );
};
