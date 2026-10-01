'use client';

import { useParams } from 'next/navigation';
import { useEffect, useId, useMemo, useState } from 'react';
import { FileX, SearchX } from 'lucide-react';

import { CatalogLoadError } from '@/components/checklist-library/CatalogLoadError';
import { CategoryNavigation } from '@/components/checklist-library/CategoryNavigation';
import { resolveCategoryPresentation } from '@/components/checklist-library/categoryPresentation';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import {
  buildDiscoveryCategories,
  filterAndSortTemplates,
  findCategoryByLegacySlug,
  type DiscoverySort,
} from '@/components/checklist-library/discovery-utils';
import { CardGrid } from '@/components/layout/CardGrid';
import { DetailPageLayout } from '@/components/layout/DetailPageLayout';
import { PageBreadcrumb } from '@/components/layout/PageBreadcrumb';
import { PageContainer } from '@/components/layout/page-shell';
import { SearchField } from '@/components/layout/SearchField';
import { Toolbar } from '@/components/layout/Toolbar';
import { ViewModeToggle } from '@/components/layout/ViewModeToggle';
import { NoIndexMeta } from '@/components/seo/NoIndexMeta';
import { Badge } from '@/components/ui/badge';
import { Empty, EmptyDescription, EmptyHeader, EmptyMedia } from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Separator } from '@/components/ui/separator';
import { Skeleton } from '@/components/ui/skeleton';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { useViewModePreference } from '@/hooks/useViewModePreference';
import { useAppRouter } from '@/lib/navigation/useAppRouter';
import {
  buildCategorySlug,
  buildPublicCategoriesPath,
  buildPublicCategoryPathForSlug,
} from '@/lib/routes';
import { formatCount } from '@/lib/utils/pluralize';
import NotFound from '@/views/NotFound';

type CategorySort = DiscoverySort | 'name';

const sortLabels: Record<CategorySort, string> = {
  popular: 'Most Popular',
  recent: 'Most Recent',
  trending: 'Trending',
  name: 'Name A-Z',
};

const isCategorySort = (value: string): value is CategorySort =>
  Object.prototype.hasOwnProperty.call(sortLabels, value);

const categoriesBreadcrumb = { href: buildPublicCategoriesPath(), label: 'All Categories' };

const templateGridSkeleton = (
  <CardGrid aria-busy="true">
    <span className="sr-only">Loading templates…</span>
    {Array.from({ length: 6 }).map((_, index) => (
      <Skeleton key={index} className="h-72 rounded-xl" />
    ))}
  </CardGrid>
);

const CategoryDetail = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  const router = useAppRouter();
  const { user } = useAuth();
  const fieldId = useId();
  const [searchQuery, setSearchQuery] = useState('');
  const [sortBy, setSortBy] = useState<CategorySort>('popular');
  const [viewMode, setViewMode] = useViewModePreference({
    surface: 'category-templates',
    userId: user?.id,
  });
  const { allCategories, templates, loading, catalogError, retryCatalog } =
    useTemplateLibrary();

  const slug = buildCategorySlug(categorySlug ?? 'business');
  const categories = useMemo(
    () => buildDiscoveryCategories(templates, allCategories),
    [allCategories, templates],
  );
  const categoryStats = categories.find((item) => item.slug === slug);
  const category = resolveCategoryPresentation(slug, categoryStats);
  const legacyCategory =
    !category && !loading && !catalogError ? findCategoryByLegacySlug(categories, slug) : null;
  const legacyCategoryPath = legacyCategory
    ? buildPublicCategoryPathForSlug(legacyCategory.slug)
    : null;

  useEffect(() => {
    if (legacyCategoryPath) router.replace(legacyCategoryPath);
  }, [legacyCategoryPath, router]);
  const categoryTemplateCount = categoryStats?.count ?? 0;
  const categoryTemplateCountLabel = formatCount(categoryTemplateCount, 'template');
  const isEmptyCategory = !loading && !catalogError && categoryTemplateCount === 0;
  const isSearching = searchQuery.trim() !== '';
  const emptyMessage = isSearching
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

  if (!category) {
    if (loading || catalogError) {
      return (
        <PageContainer width="shell" className="py-8 sm:py-10">
          <PageBreadcrumb items={[categoriesBreadcrumb]} />
          {catalogError ? (
            <CatalogLoadError onRetry={retryCatalog} titleAs="h1" />
          ) : (
            <>
              <div aria-busy="true" className="flex flex-col items-start gap-4">
                <Skeleton className="size-14 rounded-xl" />
                <Skeleton className="h-9 w-64 max-w-full" />
                <Skeleton className="h-6 w-96 max-w-full" />
              </div>
              <Separator className="my-10" />
              {templateGridSkeleton}
            </>
          )}
        </PageContainer>
      );
    }
    if (legacyCategoryPath) {
      return null;
    }
    return (
      <>
        <NoIndexMeta follow />
        <NotFound />
      </>
    );
  }

  const Icon = category.icon;

  return (
    <>
      {isEmptyCategory ? <NoIndexMeta follow /> : null}
      <DetailPageLayout
        breadcrumbs={[categoriesBreadcrumb, { label: category.name }]}
        description={category.description}
        icon={<Icon />}
        meta={
          loading ? (
            <Skeleton className="h-5 w-24" />
          ) : (
            <Badge variant="secondary">{categoryTemplateCountLabel}</Badge>
          )
        }
        title={category.name}
      >
        <Toolbar className="mb-6">
          <Field className="sm:w-auto sm:flex-1 lg:max-w-md">
            <FieldLabel htmlFor={`${fieldId}-search`}>Search</FieldLabel>
            <SearchField
              groupClassName="h-8"
              id={`${fieldId}-search`}
              placeholder="Search templates..."
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
            />
          </Field>

          <div className="flex items-end gap-3">
            <Field className="flex-1 sm:w-40 sm:flex-none">
              <FieldLabel htmlFor={`${fieldId}-sort`}>Sort by</FieldLabel>
              <Select
                items={sortLabels}
                value={sortBy}
                onValueChange={(value) => {
                  if (value && isCategorySort(value)) setSortBy(value);
                }}
              >
                <SelectTrigger className="w-full" id={`${fieldId}-sort`}>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Object.entries(sortLabels).map(([value, label]) => (
                    <SelectItem key={value} value={value}>
                      {label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            <ViewModeToggle onChange={setViewMode} value={viewMode} />
          </div>
        </Toolbar>

        {catalogError ? <CatalogLoadError className="mb-6" onRetry={retryCatalog} /> : null}
        {loading ? (
          templateGridSkeleton
        ) : filteredTemplates.length > 0 ? (
          <CardGrid columns={viewMode === 'list' ? 1 : 3}>
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                layout={viewMode === 'list' ? 'horizontal' : 'vertical'}
                template={template}
                titleAs="h2"
              />
            ))}
          </CardGrid>
        ) : catalogError ? null : (
          <Empty className="border">
            <EmptyHeader>
              <EmptyMedia variant="icon">{isSearching ? <SearchX /> : <FileX />}</EmptyMedia>
              <EmptyDescription>{emptyMessage}</EmptyDescription>
            </EmptyHeader>
          </Empty>
        )}

        <CategoryNavigation categories={categories} currentCategorySlug={slug} />
      </DetailPageLayout>
    </>
  );
};

export default CategoryDetail;
