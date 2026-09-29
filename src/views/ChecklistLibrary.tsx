'use client';

import { usePathname, useSearchParams } from 'next/navigation';
import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { Filter } from 'lucide-react';

import { CatalogLoadError } from '@/components/checklist-library/CatalogLoadError';
import { getCategoryIcon } from '@/components/checklist-library/categoryPresentation';
import { CategoryChips, SortButtons } from '@/components/checklist-library/SearchAndFilters';
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
import { CardGrid } from '@/components/layout/CardGrid';
import { ListCard } from '@/components/layout/ListCard';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { SearchField } from '@/components/layout/SearchField';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Button } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { replaceCurrentUrl } from '@/lib/navigation/replaceCurrentUrl';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import { buildPublicCategoryPathForSlug } from '@/lib/routes';

type ChecklistLibraryProps = {
  templateType?: 'checklist' | 'recipe';
  title?: string;
  description?: string;
};

// The current history entry's state, which only the browser has: the server (and hydration)
// sees none. Re-read on every render, so it follows the library's own URL writes.
const subscribeToHistory = (onChange: () => void) => {
  window.addEventListener('popstate', onChange);
  return () => window.removeEventListener('popstate', onChange);
};
const readHistoryState = (): unknown => window.history.state;
const readServerHistoryState = (): unknown => null;

// While the catalog loads, and in the server's HTML: the page's layout, with no data yet.
export const ChecklistLibrarySkeleton = () => (
  <>
    <PageSection spacing="hero">
      <div className="flex flex-col items-center gap-4">
        <Skeleton className="h-12 w-80 max-w-full" />
        <Skeleton className="h-5 w-96 max-w-full" />
        <Skeleton className="mt-2 h-10 w-full max-w-xl" />
        <div className="flex gap-2">
          <Skeleton className="h-7 w-12" />
          <Skeleton className="h-7 w-28" />
          <Skeleton className="h-7 w-24" />
        </div>
      </div>
    </PageSection>
    <PageSection spacing="compact">
      <CardGrid>
        {Array.from({ length: 6 }).map((_, index) => (
          <Skeleton key={index} className="h-72 rounded-xl" />
        ))}
      </CardGrid>
    </PageSection>
  </>
);

// The library at /templates. Its title and description are the route's metadata
// (src/app/(site)/templates/page.tsx); a caller with other text passes its own.
const ChecklistLibrary = ({
  templateType,
  title,
  description,
}: ChecklistLibraryProps) => {
  const searchParams = useSearchParams();
  const pathname = usePathname();
  const router = useAppRouter();
  const historyState = useSyncExternalStore(
    subscribeToHistory,
    readHistoryState,
    readServerHistoryState,
  );
  const legacyCategoryRedirectPath = resolveLibraryLegacyRedirect(
    searchParams,
    historyState,
  );

  // Decided on the live URL and entry state, never on the first render's (the server has
  // no history state, so it would take every entry for an arrival).
  useEffect(() => {
    const path = resolveLibraryLegacyRedirect(
      new URLSearchParams(window.location.search),
      window.history.state,
    );
    if (path) router.replace(path);
  }, [router, searchParams]);
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
    // Rewrites the URL in place (no request per keystroke). The state marks this entry as
    // written here, so a URL left with only a category does not trigger the legacy redirect.
    const nextSearch = buildLibraryFilterParams({ categorySlug, query, sort }).toString();
    replaceCurrentUrl(
      `${pathname}${nextSearch ? `?${nextSearch}` : ''}${window.location.hash}`,
      LIBRARY_FILTER_UPDATE_STATE,
    );
  };

  const handleResetFilters = () => {
    updateFilters({
      categorySlug: null,
      query: '',
      sort: DEFAULT_LIBRARY_SORT,
    });
  };
  // Leaving for the category page (the effect above); nothing to show meanwhile.
  if (legacyCategoryRedirectPath) {
    return null;
  }

  if (loading) {
    return <ChecklistLibrarySkeleton />;
  }

  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          align="center"
          chips={
            <CategoryChips
              categories={categories}
              getCategoryPath={(category) => buildPublicCategoryPathForSlug(category.slug)}
              onCategoryChange={(categorySlug) => updateFilters({ categorySlug })}
              selectedCategorySlug={selectedCategorySlug}
            />
          }
          description={
            description ??
            'Browse hundreds of ready-to-use checklists created by the community'
          }
          search={
            <SearchField
              onChange={(event) => updateFilters({ query: event.target.value })}
              placeholder="Search templates..."
              value={syncedSearchDraft.draft}
            />
          }
          title={title ?? 'Discover Templates'}
        />
      </PageSection>

      <PageSection spacing="compact">
        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p className="text-sm text-muted-foreground">{resultLabel}</p>
          <SortButtons onSortChange={(sort) => updateFilters({ sort })} sortBy={sortBy} />
        </div>

        {/* A failed catalog load must not read as "no templates matched". */}
        {catalogError ? (
          <CatalogLoadError className="mb-6" onRetry={retryCatalog} />
        ) : null}
        {filteredTemplates.length > 0 ? (
          <CardGrid>
            {filteredTemplates.map((template) => (
              <TemplateCard key={template.id} template={template} />
            ))}
          </CardGrid>
        ) : catalogError ? null : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">
                <Filter />
              </EmptyMedia>
              <EmptyTitle>No templates found</EmptyTitle>
              <EmptyDescription>Try adjusting your search or filters</EmptyDescription>
            </EmptyHeader>
            <EmptyContent>
              <Button onClick={handleResetFilters} variant="outline">
                Reset filters
              </Button>
            </EmptyContent>
          </Empty>
        )}
      </PageSection>

      <PageSection aria-labelledby="browse-by-category" spacing="spacious">
        <SectionHeader id="browse-by-category" title="Browse by Category" />
        <CardGrid columns={4}>
          {categories.slice(0, 8).map((category) => {
            const Icon = getCategoryIcon(category.slug);
            return (
              <ListCard
                key={category.slug}
                href={buildPublicCategoryPathForSlug(category.slug)}
                icon={<Icon />}
                meta={`${category.count} ${category.count === 1 ? 'template' : 'templates'}`}
                orientation="vertical"
                title={category.name}
              />
            );
          })}
        </CardGrid>
      </PageSection>
    </>
  );
};

export default ChecklistLibrary;
