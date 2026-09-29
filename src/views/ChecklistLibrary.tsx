'use client';

import React, { useMemo, useState } from 'react';
import { Navigate, useLocation, useSearchParams } from 'react-router-dom';
import { ChevronRight, Filter, Search } from 'lucide-react';

import { CatalogLoadError } from '@/components/checklist-library/CatalogLoadError';
import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
  type DiscoverySort,
} from '@/components/checklist-library/discovery-utils';
import {
  DEFAULT_LIBRARY_SORT,
  LIBRARY_FILTER_UPDATE_STATE,
  buildLibraryFilterParams,
  readLibraryFilters,
  resolveLibraryLegacyRedirect,
  syncSearchDraft,
  type SearchDraftState,
} from '@/components/checklist-library/libraryFilters';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { SEOHead } from '@/components/shared/SEOHead';
import { TEMPLATE_LIBRARY_PAGE_TEXT } from '@/lib/publicPageMeta';
import { buildPublicCategoryPathForSlug, buildSiteUrl } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

type ChecklistLibraryProps = {
  templateType?: 'checklist' | 'recipe';
  title?: string;
  description?: string;
};

const PUBLIC_TEMPLATES_URL = buildSiteUrl('/templates');

const ChecklistLibrary = ({
  templateType,
  title,
  description,
}: ChecklistLibraryProps) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const location = useLocation();
  const legacyCategoryRedirectPath = resolveLibraryLegacyRedirect(
    searchParams,
    location.state,
  );
  // The URL is the only source of the filters: this page stays mounted when a link or
  // Back/Forward changes it.
  const {
    categorySlug: selectedCategorySlug,
    query: searchQuery,
    sort: sortBy,
  } = readLibraryFilters(searchParams);
  const [searchDraft, setSearchDraft] = useState<SearchDraftState>(() => ({
    draft: searchQuery,
    syncedQuery: searchQuery,
  }));
  const syncedSearchDraft = syncSearchDraft(searchDraft, searchQuery);
  if (syncedSearchDraft !== searchDraft) {
    setSearchDraft(syncedSearchDraft);
  }

  const { templates, loading, catalogError, retryCatalog, allCategories } =
    useTemplateLibrary(undefined, templateType);

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
  const resultLabel = `${filteredTemplates.length} templates${
    selectedCategoryName ? ` in ${selectedCategoryName}` : ''
  }`;

  const updateFilters = (changes: {
    categorySlug?: string | null;
    query?: string;
    sort?: DiscoverySort;
  }) => {
    const {
      categorySlug = selectedCategorySlug,
      query = searchQuery,
      sort = sortBy,
    } = changes;
    if (changes.query !== undefined) {
      const draft = changes.query;
      setSearchDraft((current) => ({ ...current, draft }));
    }
    // The state marks this entry as written here, so a URL left with only a category
    // does not trigger the legacy redirect.
    setSearchParams(buildLibraryFilterParams({ categorySlug, query, sort }), {
      replace: true,
      state: LIBRARY_FILTER_UPDATE_STATE,
    });
  };

  const handleResetFilters = () => {
    updateFilters({
      categorySlug: null,
      query: '',
      sort: DEFAULT_LIBRARY_SORT,
    });
  };
  const seoHead = (
    <SEOHead
      title={title ?? TEMPLATE_LIBRARY_PAGE_TEXT.title}
      description={description ?? TEMPLATE_LIBRARY_PAGE_TEXT.description}
      keywords={['checklist templates', 'workflow templates', 'SOP templates']}
      url={PUBLIC_TEMPLATES_URL}
    />
  );

  if (legacyCategoryRedirectPath) {
    return <Navigate replace to={legacyCategoryRedirectPath} />;
  }

  if (loading) {
    return (
      <div className="bg-background">
        {seoHead}
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

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[320px] rounded-lg" />
            ))}
          </div>
        </main>
      </div>
    );
  }

  return (
    <div className="bg-background">
      {seoHead}
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
          getCategoryPath={(category) => buildPublicCategoryPathForSlug(category.slug)}
          onCategoryChange={(categorySlug) => updateFilters({ categorySlug })}
          onSortChange={(sort) => updateFilters({ sort })}
          resultCount={filteredTemplates.length}
          resultLabel={resultLabel}
          searchSlot={
            <div className="flex flex-1 flex-col gap-2 sm:max-w-md">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <Input
                  className="border-border bg-card pl-10"
                  onChange={(event) =>
                    updateFilters({ query: event.target.value })
                  }
                  placeholder="Search templates..."
                  value={syncedSearchDraft.draft}
                />
              </div>
              <p className="text-sm text-muted-foreground">{resultLabel}</p>
            </div>
          }
          selectedCategorySlug={selectedCategorySlug}
          sortBy={sortBy}
        />

        {/* A failed catalog load must not read as "no templates matched". */}
        {catalogError ? (
          <CatalogLoadError className="mb-6" onRetry={retryCatalog} />
        ) : null}
        {filteredTemplates.length > 0 ? (
          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {filteredTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </div>
        ) : catalogError ? null : (
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
        )}

        <section className="mt-16 border-t border-border pt-12">
          <h2 className="mb-6 text-lg font-semibold text-foreground">
            Browse by Category
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((category) => {
              return (
                <Link
                  key={category.slug}
                  href={buildPublicCategoryPathForSlug(category.slug)}
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
