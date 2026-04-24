import React, { useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { ChevronRight, Filter } from 'lucide-react';

import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import { TemplatesDiscoveryHeader } from '@/components/checklist-library/TemplatesDiscoveryHeader';
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
  type DiscoverySort,
} from '@/components/checklist-library/discovery-utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { buildPublicTemplatesPath } from '@/lib/routes';

type ChecklistLibraryProps = {
  templateType?: 'checklist' | 'recipe';
  title?: string;
  description?: string;
};

const DEFAULT_SORT: DiscoverySort = 'popular';

const ChecklistLibrary = ({
  templateType,
  title,
  description,
}: ChecklistLibraryProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const [searchQuery, setSearchQuery] = useState(
    () => searchParams.get('search') ?? '',
  );
  const [selectedCategorySlug, setSelectedCategorySlug] = useState<string | null>(
    () => searchParams.get('category'),
  );
  const [sortBy, setSortBy] = useState<DiscoverySort>(() => {
    const sort = searchParams.get('sort');
    return sort === 'recent' || sort === 'trending' || sort === 'popular'
      ? sort
      : DEFAULT_SORT;
  });

  const { templates, loading, allCategories } = useTemplateLibrary(
    undefined,
    templateType,
  );

  const categories = useMemo(
    () => buildDiscoveryCategories(templates, allCategories),
    [allCategories, templates],
  );
  const selectedCategoryName =
    categories.find((category) => category.slug === selectedCategorySlug)?.name ??
    null;

  const filteredTemplates = useMemo(
    () =>
      filterAndSortTemplates(templates, {
        categorySlug: selectedCategorySlug,
        searchQuery,
        sortBy,
      }),
    [searchQuery, selectedCategorySlug, sortBy, templates],
  );

  const updateFilters = ({
    categorySlug = selectedCategorySlug,
    query = searchQuery,
    sort = sortBy,
  }: {
    categorySlug?: string | null;
    query?: string;
    sort?: DiscoverySort;
  }) => {
    const nextParams = new URLSearchParams();
    const normalizedQuery = query.trim();

    if (categorySlug) {
      nextParams.set('category', categorySlug);
    }
    if (normalizedQuery) {
      nextParams.set('search', normalizedQuery);
    }
    if (sort !== DEFAULT_SORT) {
      nextParams.set('sort', sort);
    }

    setSearchQuery(query);
    setSelectedCategorySlug(categorySlug);
    setSortBy(sort);
    setSearchParams(nextParams, { replace: true });
  };

  const handleResetFilters = () => {
    updateFilters({
      categorySlug: null,
      query: '',
      sort: DEFAULT_SORT,
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background">
        <TemplatesDiscoveryHeader />

        <main className="mx-auto max-w-6xl px-4 py-8">
          <div className="mb-10 space-y-3 text-center">
            <Skeleton className="mx-auto h-9 w-56" />
            <Skeleton className="mx-auto h-5 w-80 max-w-full" />
          </div>

          <div className="mb-8 flex items-center gap-2 overflow-x-auto pb-2">
            <Skeleton className="h-9 w-16 shrink-0" />
            <Skeleton className="h-9 w-28 shrink-0" />
            <Skeleton className="h-9 w-24 shrink-0" />
          </div>

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[320px] rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <TemplatesDiscoveryHeader
        onSearchChange={(query) => updateFilters({ query })}
        searchQuery={searchQuery}
      />

      <main className="mx-auto max-w-6xl px-4 py-8">
        <div className="mb-10 text-center">
          <h1 className="mb-3 text-balance text-3xl font-bold text-foreground">
            {title ?? 'Discover Templates'}
          </h1>
          <p className="text-muted-foreground">
            {description ??
              'Browse hundreds of ready-to-use checklists created by the community'}
          </p>
        </div>

        <SearchAndFilters
          categories={categories}
          onCategoryChange={(categorySlug) => updateFilters({ categorySlug })}
          onSortChange={(sort) => updateFilters({ sort })}
          resultCount={filteredTemplates.length}
          resultLabel={`${filteredTemplates.length} templates${
            selectedCategoryName ? ` in ${selectedCategoryName}` : ''
          }`}
          selectedCategorySlug={selectedCategorySlug}
          sortBy={sortBy}
        />

        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-secondary">
              <Filter className="h-7 w-7 text-muted-foreground" />
            </div>
            <h3 className="mb-1 text-sm font-medium text-foreground">
              No templates found
            </h3>
            <p className="text-sm text-muted-foreground">
              Try adjusting your search or filters
            </p>
            <Button
              className="mt-6"
              onClick={handleResetFilters}
              variant="outline"
            >
              Reset filters
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
            {filteredTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        )}

        <section className="mt-16 border-t border-border pt-12">
          <h2 className="mb-6 text-lg font-semibold text-foreground">
            Browse by Category
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((category) => {
              const query = `?category=${encodeURIComponent(category.slug)}`;

              return (
                <Link
                  key={category.slug}
                  to={`${buildPublicTemplatesPath()}${query}`}
                  onClick={(event) => {
                    event.preventDefault();
                    updateFilters({ categorySlug: category.slug });
                    if (typeof window !== 'undefined') {
                      window.scrollTo({ behavior: 'smooth', top: 0 });
                    }
                  }}
                  className="group flex items-center justify-between rounded-lg border border-border bg-card p-4 transition-colors hover:border-muted-foreground/30"
                >
                  <div>
                    <h3 className="font-medium text-foreground transition-colors group-hover:text-primary">
                      {category.name}
                    </h3>
                    <p className="text-xs text-muted-foreground">
                      {category.count}{' '}
                      {category.count === 1 ? 'template' : 'templates'}
                    </p>
                  </div>
                  <ChevronRight className="h-4 w-4 text-muted-foreground transition-colors group-hover:text-foreground" />
                </Link>
              );
            })}
          </div>
        </section>
      </main>
    </div>
  );
};

export default ChecklistLibrary;
