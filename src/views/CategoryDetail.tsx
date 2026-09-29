'use client';

import { useMemo, useState } from 'react';
import { Navigate, useParams } from 'react-router-dom';
import { ArrowLeft, Grid3X3, List, Search } from 'lucide-react';

import { CatalogLoadError } from '@/components/checklist-library/CatalogLoadError';
import { CategoryNavigation } from '@/components/checklist-library/CategoryNavigation';
import { resolveCategoryPresentation } from '@/components/checklist-library/categoryPresentation';
import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
  findCategoryByLegacySlug,
  type DiscoverySort,
} from '@/components/checklist-library/discovery-utils';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Skeleton } from '@/components/ui/skeleton';
import NotFound from '@/views/NotFound';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { SEOHead } from '@/components/shared/SEOHead';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useViewModePreference } from '@/hooks/useViewModePreference';
import { buildCategoryPageTitle } from '@/lib/publicPageMeta';
import { buildCategorySlug, buildPublicCategoryPathForSlug, buildSiteUrl } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

type CategorySort = DiscoverySort | 'name';

const sortLabels: Record<CategorySort, string> = {
  name: 'Name A-Z',
  popular: 'Most Popular',
  recent: 'Most Recent',
  trending: 'Trending',
};

const isCategorySort = (value: string): value is CategorySort =>
  Object.prototype.hasOwnProperty.call(sortLabels, value);
const CATEGORY_BASE_URL = buildSiteUrl('/categories');

const backToCategories = (
  <div className="mb-6 flex items-center gap-2 text-sm">
    <Link
      className="flex items-center gap-1 text-muted-foreground hover:text-foreground"
      href="/categories"
    >
      <ArrowLeft className="h-4 w-4" />
      All Categories
    </Link>
  </div>
);

const templateGridSkeleton = (
  <div aria-busy="true" className="mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
    <span className="sr-only">Loading templates…</span>
    {Array.from({ length: 6 }).map((_, index) => (
      <Skeleton key={index} className="h-[220px] rounded-lg" />
    ))}
  </div>
);

const CategoryDetail = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const { user } = useAuth();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CategorySort>('popular');
  const [viewMode, setViewMode] = useViewModePreference({
    surface: 'category-templates',
    userId: user?.id,
  });
  const { allCategories, templates, loading, catalogError, retryCatalog } =
    useTemplateLibrary();

  // The param is decoded but may differ in case or Unicode normal form from the slug.
  const slug = buildCategorySlug(categorySlug ?? 'business');
  const categories = useMemo(
    () => buildDiscoveryCategories(templates, allCategories),
    [allCategories, templates],
  );
  const categoryStats = categories.find((item) => item.slug === slug);
  const category = resolveCategoryPresentation(slug, categoryStats);
  const categoryTemplateCount = categoryStats?.count ?? 0;
  // Registry categories render before any public Template uses them; keep those empty
  // pages out of search results, but only once the catalog API has answered. Bundled
  // Templates arrive first, so a count of 0 means nothing until then.
  const isEmptyCategory = !loading && !catalogError && categoryTemplateCount === 0;
  const emptyMessage = searchQuery.trim()
    ? 'No templates found matching your search.'
    : 'No public templates in this category yet.';

  const filteredTemplates = useMemo(() => {
    const base =
      sortBy === 'name'
        ? filterAndSortTemplates(templates, {
            categorySlug: slug,
            searchQuery,
            sortBy: 'popular',
          })
        : filterAndSortTemplates(templates, {
            categorySlug: slug,
            searchQuery,
            sortBy,
          });

    return sortBy === 'name'
      ? [...base].sort((left, right) => left.title.localeCompare(right.title))
      : base;
  }, [searchQuery, slug, sortBy, templates]);

  // Categories that exist only in database templates are unknown until the catalog loads,
  // so the 404 page waits for a successful load.
  if (!category) {
    if (loading || catalogError) {
      return (
        <div className="bg-background">
          <main className="mx-auto max-w-6xl px-4 py-8">
            {backToCategories}
            {catalogError ? (
              <CatalogLoadError onRetry={retryCatalog} />
            ) : (
              <>
                <div aria-busy="true" className="mb-8 flex items-start gap-6">
                  <Skeleton className="h-16 w-16 shrink-0 rounded-2xl" />
                  <div className="flex-1 space-y-3">
                    <Skeleton className="h-8 w-64 max-w-full" />
                    <Skeleton className="h-5 w-96 max-w-full" />
                  </div>
                </div>
                {templateGridSkeleton}
              </>
            )}
          </main>
        </div>
      );
    }
    const legacyCategory = findCategoryByLegacySlug(categories, slug);
    if (legacyCategory) {
      return <Navigate replace to={buildPublicCategoryPathForSlug(legacyCategory.slug)} />;
    }
    return <NotFound />;
  }

  const Icon = category.icon;

  return (
    <div className="bg-background">
      <SEOHead
        title={buildCategoryPageTitle(category.name)}
        description={
          loading
            ? `Templates for ${category.name}. ${category.description}`
            : `${categoryTemplateCount} templates for ${category.name}. ${category.description}`
        }
        keywords={[category.name, 'checklist templates', 'workflow templates']}
        url={`${CATEGORY_BASE_URL}/${encodeURIComponent(slug)}`}
        robots={isEmptyCategory ? 'noindex, follow' : undefined}
      />
      <main className="mx-auto max-w-6xl px-4 py-8">
        {backToCategories}

        <div className="mb-8 flex items-start gap-6">
          <div
            className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl ${category.bgColor}`}
          >
            <Icon className={`h-8 w-8 ${category.color}`} />
          </div>
          <div>
            <h1 className="text-2xl font-bold text-foreground">
              {category.name}
            </h1>
            <p className="mt-1 text-muted-foreground">{category.description}</p>
            {loading ? (
              <Skeleton className="mt-3 h-5 w-24" />
            ) : (
              <Badge className="mt-3" variant="secondary">
                {categoryTemplateCount} templates
              </Badge>
            )}
          </div>
        </div>

        <SearchAndFilters
          categories={[]}
          onCategoryChange={() => undefined}
          onSortChange={() => undefined}
          resultCount={filteredTemplates.length}
          searchSlot={
            <div className="relative max-w-sm flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                className="border-border bg-card pl-10"
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search templates..."
                value={searchQuery}
              />
            </div>
          }
          selectedCategorySlug={null}
          sortBy="popular"
          trailingControls={
            <div className="flex items-center gap-2">
              <Select
                value={sortBy}
                onValueChange={(value) => {
                  if (isCategorySort(value)) setSortBy(value);
                }}
              >
                <SelectTrigger className="w-40 border-border bg-card">
                  <SelectValue>{sortLabels[sortBy]}</SelectValue>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="popular">Most Popular</SelectItem>
                  <SelectItem value="recent">Most Recent</SelectItem>
                  <SelectItem value="trending">Trending</SelectItem>
                  <SelectItem value="name">Name A-Z</SelectItem>
                </SelectContent>
              </Select>
              <div className="flex rounded-lg border border-border bg-card">
                <button
                  aria-label="Show templates in grid view"
                  aria-pressed={viewMode === 'grid'}
                  className={`inline-flex h-9 w-9 items-center justify-center ${viewMode === 'grid' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setViewMode('grid')}
                  type="button"
                >
                  <Grid3X3 className="h-4 w-4" />
                </button>
                <button
                  aria-label="Show templates in list view"
                  aria-pressed={viewMode === 'list'}
                  className={`inline-flex h-9 w-9 items-center justify-center ${viewMode === 'list' ? 'bg-secondary text-foreground' : 'text-muted-foreground'}`}
                  onClick={() => setViewMode('list')}
                  type="button"
                >
                  <List className="h-4 w-4" />
                </button>
              </div>
            </div>
          }
        />

        {catalogError ? (
          <CatalogLoadError className="mt-6" onRetry={retryCatalog} />
        ) : null}
        {loading ? (
          templateGridSkeleton
        ) : filteredTemplates.length > 0 ? (
          <div
            className={
              viewMode === 'grid'
                ? 'mt-6 grid gap-4 sm:grid-cols-2 lg:grid-cols-3'
                : 'mt-6 space-y-4'
            }
          >
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                layout={viewMode === 'list' ? 'horizontal' : 'vertical'}
                template={template}
              />
            ))}
          </div>
        ) : catalogError ? null : (
          <div className="mt-6 rounded-xl border border-border bg-card p-12 text-center">
            <p className="text-muted-foreground">{emptyMessage}</p>
          </div>
        )}

        <CategoryNavigation
          categories={categories}
          currentCategorySlug={slug}
        />
      </main>
    </div>
  );
};

export default CategoryDetail;
