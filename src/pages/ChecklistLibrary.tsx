import React, { useMemo } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { Compass, Filter } from 'lucide-react';

import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
  type DiscoverySort,
} from '@/components/checklist-library/discovery-utils';
import { PublicPill } from '@/components/shared/PublicPill';
import { Button } from '@/components/ui/button';
import { PageContainer } from '@/components/layout/page-shell';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import {
  buildCanonicalPublicTemplatePath,
  buildPublicCategoryPath,
  buildPublicTemplatesPath,
  findCategoryNameBySlug,
} from '@/lib/routes';

type ChecklistLibraryProps = {
  templateType?: 'checklist' | 'recipe';
  title?: string;
  description?: string;
};

const DEFAULT_SORT: DiscoverySort = 'popular';

const normalizeSort = (value: string | null): DiscoverySort => {
  if (value === 'recent' || value === 'trending') {
    return value;
  }

  return DEFAULT_SORT;
};

const ChecklistLibrary = ({
  templateType,
  title,
  description,
}: ChecklistLibraryProps) => {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();

  const { templates, loading, allCategories } = useTemplateLibrary(
    categorySlug,
    templateType,
  );

  const searchQuery = searchParams.get('q') ?? '';
  const sortBy = normalizeSort(searchParams.get('sort'));
  const queryCategorySlug = searchParams.get('category')?.trim().toLowerCase() ?? null;
  const activeCategorySlug = categorySlug ?? queryCategorySlug;

  const routeCategoryName = categorySlug
    ? (findCategoryNameBySlug(allCategories, categorySlug) ?? categorySlug)
    : undefined;
  const selectedCategoryName = activeCategorySlug
    ? (findCategoryNameBySlug(allCategories, activeCategorySlug) ??
      activeCategorySlug)
    : undefined;

  const categories = useMemo(
    () => buildDiscoveryCategories(templates, allCategories),
    [allCategories, templates],
  );

  const filteredTemplates = useMemo(
    () =>
      filterAndSortTemplates(templates, {
        categorySlug: activeCategorySlug,
        searchQuery,
        sortBy,
      }),
    [activeCategorySlug, searchQuery, sortBy, templates],
  );

  const buildSearchParamsString = () => {
    const nextParams = new URLSearchParams(searchParams);
    nextParams.delete('category');

    if (!nextParams.get('q')) {
      nextParams.delete('q');
    }

    if (!nextParams.get('sort')) {
      nextParams.delete('sort');
    }

    const nextQuery = nextParams.toString();
    return nextQuery ? `?${nextQuery}` : '';
  };

  const updateSearchParams = (
    updater: (params: URLSearchParams) => void,
    options?: { replace?: boolean },
  ) => {
    const nextParams = new URLSearchParams(searchParams);
    updater(nextParams);

    if (!nextParams.get('q')) {
      nextParams.delete('q');
    }

    if (!nextParams.get('sort')) {
      nextParams.delete('sort');
    }

    if (!nextParams.get('category')) {
      nextParams.delete('category');
    }

    setSearchParams(nextParams, { replace: options?.replace ?? true });
  };

  const handleTemplateClick = (template: {
    id: string;
    slug?: string;
    userId: string;
    ownerProfile?: { username?: string };
  }) => {
    const path = buildCanonicalPublicTemplatePath(template);
    navigate(path ?? buildPublicTemplatesPath());
  };

  const handleCategoryChange = (nextCategorySlug: string | null) => {
    if (categorySlug) {
      const nextPath = nextCategorySlug
        ? buildPublicCategoryPath(
            findCategoryNameBySlug(allCategories, nextCategorySlug) ??
              nextCategorySlug,
          )
        : buildPublicTemplatesPath();

      navigate(`${nextPath}${buildSearchParamsString()}`);
      return;
    }

    updateSearchParams((params) => {
      if (nextCategorySlug) {
        params.set('category', nextCategorySlug);
      } else {
        params.delete('category');
      }
    });
  };

  const handleSortChange = (nextSort: DiscoverySort) => {
    updateSearchParams((params) => {
      params.set('sort', nextSort);
    });
  };

  if (loading) {
    return (
      <div className="pb-20">
        <PageContainer className="pt-10 pb-6" width="content">
          <div className="space-y-4 text-center">
            <Skeleton className="mx-auto h-8 w-40" />
            <Skeleton className="mx-auto h-12 w-full max-w-3xl" />
            <Skeleton className="mx-auto h-6 w-full max-w-2xl" />
          </div>
        </PageContainer>

        <PageContainer className="space-y-8" width="content">
          <Skeleton className="h-14 w-full" />
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {Array.from({ length: 8 }).map((_, index) => (
              <Skeleton key={index} className="h-[420px] rounded-xl" />
            ))}
          </div>
        </PageContainer>
      </div>
    );
  }

  return (
    <div className="pb-20">
      <PageContainer className="pt-10 pb-6" width="content">
        <div className="space-y-4 text-center">
          <div className="inline-flex items-center gap-2 rounded-md border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <Compass className="h-4 w-4" />
            {routeCategoryName ? 'Category collection' : 'Template library'}
          </div>

          <h1 className="text-balance text-3xl font-bold tracking-tight text-foreground sm:text-4xl">
            {title ??
              (routeCategoryName
                ? `${routeCategoryName} template packs`
                : 'Discover Templates')}
          </h1>

          <p className="mx-auto max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base sm:leading-7">
            {description ??
              (routeCategoryName
                ? `Browse community templates tagged for ${routeCategoryName.toLowerCase()}, then open the detail page to copy or run them.`
                : 'Browse hundreds of ready-to-use checklists created by the community')}
          </p>

          {categorySlug ? (
            <div className="pt-2">
              <PublicPill asChild tone="subtle" className="cursor-pointer">
                <Link to={buildPublicTemplatesPath()}>Back to all templates</Link>
              </PublicPill>
            </div>
          ) : null}
        </div>
      </PageContainer>

      <PageContainer className="space-y-10" width="content">
        <SearchAndFilters
          categories={categories}
          onCategoryChange={handleCategoryChange}
          onSortChange={handleSortChange}
          resultCount={filteredTemplates.length}
          selectedCategorySlug={activeCategorySlug}
          sortBy={sortBy}
        />

        {filteredTemplates.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-xl border border-border bg-card/60 px-6 py-16 text-center">
            <div className="mb-4 flex h-16 w-16 items-center justify-center rounded-full border border-border bg-secondary/40">
              <Filter className="h-7 w-7 text-muted-foreground" />
            </div>
            <h2 className="text-lg font-semibold text-foreground">
              No templates found
            </h2>
            <p className="mt-2 max-w-md text-sm leading-6 text-muted-foreground">
              {activeCategorySlug
                ? `No public templates are currently tagged for ${selectedCategoryName ?? activeCategorySlug}.`
                : searchQuery
                  ? `No template packs matched "${searchQuery}".`
                  : templateType === 'recipe'
                    ? 'No public recipes are available yet.'
                    : 'No public templates are available yet.'}
            </p>
            <Button
              className="mt-6"
              onClick={() => navigate(buildPublicTemplatesPath())}
              variant="outline"
            >
              Browse all templates
            </Button>
          </div>
        ) : (
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-4">
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                onTemplateClick={handleTemplateClick}
                template={template}
              />
            ))}
          </div>
        )}

        <section className="border-t border-border pt-10">
          <h2 className="mb-6 text-lg font-semibold text-foreground">
            Browse by Category
          </h2>

          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {categories.slice(0, 8).map((category) => (
              <Link
                key={category.slug}
                to={`${buildPublicTemplatesPath()}?category=${encodeURIComponent(category.slug)}`}
                className="group flex items-center justify-between rounded-lg border border-border bg-card/60 p-4 transition-colors hover:border-border/80 hover:bg-secondary/20"
              >
                <div>
                  <h3 className="font-medium text-foreground group-hover:text-primary">
                    {category.name}
                  </h3>
                  <p className="text-xs text-muted-foreground">
                    {category.count} {category.count === 1 ? 'template' : 'templates'}
                  </p>
                </div>
                <span className="text-muted-foreground transition group-hover:text-foreground">
                  →
                </span>
              </Link>
            ))}
          </div>
        </section>
      </PageContainer>
    </div>
  );
};

export default ChecklistLibrary;
