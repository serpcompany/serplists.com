import React from 'react';
import { Filter, Grid, List, Search, X } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { MultiSelect } from '@/components/ui/multi-select';
import { cn } from '@/lib/utils';

interface SearchAndFiltersProps {
  resultCount: number;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  viewMode: 'grid' | 'list';
  setViewMode: (mode: 'grid' | 'list') => void;
  allCategories: string[];
  selectedCategories: string[];
  setSelectedCategories: (categories: string[]) => void;
}

export const SearchAndFilters: React.FC<SearchAndFiltersProps> = ({
  resultCount,
  searchQuery,
  setSearchQuery,
  viewMode,
  setViewMode,
  allCategories,
  selectedCategories,
  setSelectedCategories,
}) => {
  return (
    <div className="mb-8 overflow-hidden rounded-xl border border-border/80 bg-card/96 p-4 shadow-[0_12px_28px_-24px_rgba(15,23,42,0.12)] sm:p-5">
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="relative flex-1 min-w-0">
          <Search className="absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            aria-label="Search templates"
            placeholder="Search template packs, workflows, and process templates..."
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            className="h-11 rounded-lg border-border bg-background pl-11 text-sm shadow-none"
          />
        </div>

        <div className="flex flex-wrap items-center gap-3 xl:justify-end">
          <div className="text-sm text-muted-foreground">
            <span className="font-semibold text-foreground">{resultCount}</span>{' '}
            {resultCount === 1 ? 'result' : 'results'}
          </div>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('grid')}
            className={cn(
              'rounded-full border border-border/80 bg-background px-3',
              viewMode === 'grid' &&
                'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
            )}
          >
            <Grid className="mr-2 h-4 w-4" />
            Grid
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => setViewMode('list')}
            className={cn(
              'rounded-full border border-border/80 bg-background px-3',
              viewMode === 'list' &&
                'bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground',
            )}
          >
            <List className="mr-2 h-4 w-4" />
            List
          </Button>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-4 lg:flex-row lg:items-center">
        <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Filter className="h-4 w-4" />
          Filter categories
        </div>

        <div className="min-w-0 flex-1">
          <MultiSelect
            options={allCategories}
            selected={selectedCategories}
            onChange={setSelectedCategories}
            placeholder="Select one or more categories…"
            className="w-full"
          />
        </div>

        {selectedCategories.length > 0 ? (
          <Button
            type="button"
            variant="ghost"
            onClick={() => setSelectedCategories([])}
            className="justify-start rounded-full border border-transparent px-3 text-muted-foreground hover:border-border/80 hover:bg-background hover:text-foreground"
          >
            <X className="mr-2 h-4 w-4" />
            Clear filters
          </Button>
        ) : null}
      </div>
    </div>
  );
};
