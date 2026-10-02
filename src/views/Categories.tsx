'use client';

import { useId, useMemo, useRef, useState } from 'react';
import { ArrowRight, ChevronRight, Search } from 'lucide-react';

import { CatalogLoadError } from '@/components/checklist-library/CatalogLoadError';
import { getCategoryIcon } from '@/components/checklist-library/categoryPresentation';
import { buildDiscoveryCategories } from '@/components/checklist-library/discovery-utils';
import { CardGrid } from '@/components/layout/CardGrid';
import { CtaBanner } from '@/components/layout/CtaBanner';
import { ListCard } from '@/components/layout/ListCard';
import { PageSection } from '@/components/layout/page-shell';
import { PageHero } from '@/components/layout/PageHero';
import { SearchField } from '@/components/layout/SearchField';
import { SectionHeader } from '@/components/layout/SectionHeader';
import { Link } from '@/components/navigation/Link';
import { Badge } from '@/components/ui/badge';
import { Button, buttonVariants } from '@/components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '@/components/ui/empty';
import { Field, FieldLabel } from '@/components/ui/field';
import { Skeleton } from '@/components/ui/skeleton';
import { PUBLIC_CATEGORY_REGISTRY } from '@/data/publicCategories';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import { buildConsoleTemplateCreatePath, buildPublicCategoryPathForSlug } from '@/lib/routes';
import { formatCount } from '@/lib/utils/pluralize';

const describeCategory = (slug: string) =>
  PUBLIC_CATEGORY_REGISTRY.find((category) => category.slug === slug)?.description ??
  'Community templates for this workflow area';

const featuredCategoriesSkeleton = (
  <>
    <span className="sr-only">Loading categories…</span>
    {Array.from({ length: 4 }).map((_, index) => (
      <Skeleton key={index} className="h-28 rounded-lg" />
    ))}
  </>
);
const allCategoriesSkeleton = Array.from({ length: 6 }).map((_, index) => (
  <Skeleton key={index} className="h-20 rounded-lg" />
));

const Categories = () => {
  const [searchQuery, setSearchQuery] = useState('');
  const searchField = useRef<HTMLInputElement>(null);
  const searchId = useId();
  const { allCategories, templates, loading, catalogError, retryCatalog } =
    useTemplateLibrary();
  const categories = useMemo(
    () => buildDiscoveryCategories(templates, allCategories),
    [allCategories, templates],
  );
  const featuredCategories = categories.slice(0, 4);

  const filteredCategories = useMemo(() => {
    const normalizedQuery = searchQuery.trim().toLowerCase();
    if (!normalizedQuery) {
      return categories;
    }

    return categories.filter(
      (category) =>
        category.name.toLowerCase().includes(normalizedQuery) ||
        describeCategory(category.slug).toLowerCase().includes(normalizedQuery),
    );
  }, [categories, searchQuery]);
  const trimmedQuery = searchQuery.trim();
  const noMatches = !loading && trimmedQuery !== '' && filteredCategories.length === 0;
  const clearSearch = () => {
    setSearchQuery('');
    searchField.current?.focus();
  };

  return (
    <>
      <PageSection spacing="hero">
        <PageHero
          align="center"
          description="Explore templates organized by category to find exactly what you need."
          search={
            <Field>
              <FieldLabel htmlFor={searchId}>Search categories</FieldLabel>
              <SearchField
                id={searchId}
                placeholder="Search categories..."
                ref={searchField}
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
            </Field>
          }
          title="Browse Categories"
        />
      </PageSection>

      {catalogError ? (
        <PageSection spacing="compact">
          <CatalogLoadError onRetry={retryCatalog} />
        </PageSection>
      ) : (
        <>
          <PageSection aria-busy={loading || undefined} aria-labelledby="popular-categories" spacing="compact">
            <SectionHeader id="popular-categories" title="Popular Categories" />
            <CardGrid columns={4}>
              {loading
                ? featuredCategoriesSkeleton
                : featuredCategories.map((category) => {
                    const Icon = getCategoryIcon(category.slug);
                    return (
                      <ListCard
                        key={category.slug}
                        href={buildPublicCategoryPathForSlug(category.slug)}
                        icon={<Icon />}
                        meta={formatCount(category.count, 'template')}
                        orientation="vertical"
                        title={category.name}
                      />
                    );
                  })}
            </CardGrid>
          </PageSection>

          <PageSection aria-busy={loading || undefined} aria-labelledby="all-categories" spacing="compact">
            <SectionHeader id="all-categories" title="All Categories" />
            {noMatches ? (
              <Empty className="border">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Search />
                  </EmptyMedia>
                  <EmptyTitle>
                    <h3>No categories match &quot;{trimmedQuery}&quot;</h3>
                  </EmptyTitle>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={clearSearch} type="button" variant="outline">
                    Clear search
                  </Button>
                </EmptyContent>
              </Empty>
            ) : (
              <CardGrid columns={2}>
                {loading
                  ? allCategoriesSkeleton
                  : filteredCategories.map((category) => {
                      const Icon = getCategoryIcon(category.slug);
                      return (
                        <ListCard
                          key={category.slug}
                          description={describeCategory(category.slug)}
                          href={buildPublicCategoryPathForSlug(category.slug)}
                          icon={<Icon />}
                          meta={
                            <>
                              <Badge variant="secondary">{formatCount(category.count, 'template')}</Badge>
                              <ChevronRight aria-hidden="true" className="size-4" />
                            </>
                          }
                          title={category.name}
                        />
                      );
                    })}
              </CardGrid>
            )}
          </PageSection>
        </>
      )}

      <PageSection spacing="spacious">
        <CtaBanner
          actions={
            <Link href={buildConsoleTemplateCreatePath()} className={buttonVariants()}>
              Create Template
              <ArrowRight data-icon="inline-end" />
            </Link>
          }
          description="Create your own template from scratch and share it with the community."
          title="Can't find what you're looking for?"
        />
      </PageSection>
    </>
  );
};

export default Categories;
