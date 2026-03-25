import React, { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Compass, Layers3, Sparkles } from 'lucide-react';

import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import { PublicPageContainer } from '@/components/layout/PublicPageLayout';
import { PublicPill } from '@/components/shared/PublicPill';
import { Button } from '@/components/ui/button';
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

const ChecklistLibrary = ({
  templateType,
  title,
  description,
}: ChecklistLibraryProps) => {
  const { categorySlug } = useParams<{ categorySlug?: string }>();
  const navigate = useNavigate();
  const [viewMode, setViewMode] = useState<'grid' | 'list'>('grid');

  const {
    templates,
    filteredTemplates,
    loading,
    searchQuery,
    setSearchQuery,
    selectedCategories,
    setSelectedCategories,
    allCategories,
  } = useTemplateLibrary(categorySlug, templateType);

  const activeCategoryName = categorySlug
    ? (findCategoryNameBySlug(allCategories, categorySlug) ?? categorySlug)
    : undefined;

  const featuredCategories = useMemo(() => {
    const categories = activeCategoryName
      ? allCategories.filter((category) => category !== activeCategoryName)
      : allCategories;

    return categories.slice(0, 6);
  }, [activeCategoryName, allCategories]);

  const totalVisibleItems = useMemo(
    () =>
      filteredTemplates.reduce(
        (total, template) =>
          total +
          template.sections.reduce(
            (sectionTotal, section) => sectionTotal + section.items.length,
            0,
          ),
        0,
      ),
    [filteredTemplates],
  );

  const handleTemplateClick = (template: {
    id: string;
    slug?: string;
    userId: string;
    ownerProfile?: { username?: string };
  }) => {
    const path = buildCanonicalPublicTemplatePath(template);
    navigate(path ?? buildPublicTemplatesPath());
  };

  if (loading) {
    return (
      <PublicPageContainer className="py-14">
        <div className="glass-panel p-8">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="mt-4 h-12 w-full max-w-2xl" />
          <Skeleton className="mt-4 h-6 w-full max-w-xl" />
          <div className="mt-8 grid gap-4 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, index) => (
              <Skeleton key={index} className="h-52 rounded-xl" />
            ))}
          </div>
        </div>
      </PublicPageContainer>
    );
  }

  return (
    <div className="pb-20">
      <PublicPageContainer className="pb-10 pt-14">
        <div className="glass-panel overflow-hidden p-6 sm:p-8 lg:p-10">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1.2fr)_minmax(280px,0.8fr)] lg:items-start">
            <div>
              <div className="inline-flex items-center gap-2 rounded-full border border-border bg-secondary px-4 py-2 text-sm font-medium text-secondary-foreground">
                <Compass className="h-4 w-4" />
                {activeCategoryName
                  ? 'Category collection'
                  : 'Public checklist library'}
              </div>

              <h1 className="mt-6 max-w-4xl text-4xl font-semibold text-foreground sm:text-5xl">
                {title ??
                  (activeCategoryName
                    ? `${activeCategoryName} checklist packs`
                    : 'Find the checklist pack that already solved it')}
              </h1>

              <p className="mt-4 max-w-2xl text-base leading-8 text-muted-foreground sm:text-lg">
                {description ??
                  (activeCategoryName
                    ? `Browse community checklists tagged for ${activeCategoryName.toLowerCase()}, then open the detail page to copy or run them.`
                    : 'Explore public process templates, scan what each pack includes, and jump straight into creator-owned detail pages.')}
              </p>

              {featuredCategories.length > 0 ? (
                <div className="mt-6 flex flex-wrap gap-2">
                  {featuredCategories.map((category) => (
                    <PublicPill
                      key={category}
                      asChild
                      className="cursor-pointer"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          navigate(buildPublicCategoryPath(category))
                        }
                      >
                        {category}
                      </button>
                    </PublicPill>
                  ))}
                </div>
              ) : null}
            </div>

            <div className="grid gap-4 sm:grid-cols-3 lg:grid-cols-1">
              <div className="marketing-metric">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Sparkles className="h-4 w-4" />
                  Templates in view
                </div>
                <div className="mt-4 text-3xl font-semibold text-foreground">
                  {filteredTemplates.length}
                </div>
              </div>

              <div className="marketing-metric">
                <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
                  <Layers3 className="h-4 w-4" />
                  Actionable steps
                </div>
                <div className="mt-4 text-3xl font-semibold text-foreground">
                  {totalVisibleItems}
                </div>
              </div>

              <div className="marketing-metric">
                <div className="text-sm font-medium text-muted-foreground">
                  Available categories
                </div>
                <div className="mt-4 text-3xl font-semibold text-foreground">
                  {allCategories.length}
                </div>
              </div>
            </div>
          </div>
        </div>
      </PublicPageContainer>

      <PublicPageContainer>
        <SearchAndFilters
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
          allCategories={allCategories}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />

        <div className="mb-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="text-sm text-muted-foreground">
            Showing{' '}
            <span className="font-semibold text-foreground">
              {filteredTemplates.length}
            </span>{' '}
            {filteredTemplates.length === 1 ? 'template' : 'templates'}
            {selectedCategories.length > 0 ? ' with active filters' : ''}
          </div>

          {selectedCategories.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {selectedCategories.map((category) => (
                <PublicPill key={category} tone="subtle">
                  {category}
                </PublicPill>
              ))}
            </div>
          ) : null}
        </div>

        {filteredTemplates.length === 0 ? (
          <div className="glass-panel p-10 text-center">
            <h2 className="text-2xl font-semibold text-foreground">
              Nothing matched this view
            </h2>
            <p className="mt-4 text-sm leading-7 text-muted-foreground">
              {activeCategoryName
                ? `No public checklist packs are currently tagged for ${activeCategoryName}.`
                : searchQuery
                  ? `No checklist packs matched "${searchQuery}".`
                  : templateType === 'recipe'
                    ? 'No public recipes are available yet.'
                    : 'No public checklists are available yet.'}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={() => navigate(buildPublicTemplatesPath())}
              className="mt-6 rounded-full"
            >
              Browse the full library
            </Button>
          </div>
        ) : (
          <div
            className={
              viewMode === 'grid'
                ? 'grid gap-6 md:grid-cols-2 xl:grid-cols-3'
                : 'space-y-4'
            }
          >
            {filteredTemplates.map((template) => (
              <TemplateCard
                key={template.id}
                template={template}
                viewMode={viewMode}
                onTemplateClick={handleTemplateClick}
              />
            ))}
          </div>
        )}
      </PublicPageContainer>

      {templates.length > filteredTemplates.length ? (
        <PublicPageContainer className="mt-12">
          <div className="rounded-2xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-[0_18px_48px_-34px_rgba(15,23,42,0.18)]">
            The library currently indexes {templates.length} public templates
            across {allCategories.length} categories.
          </div>
        </PublicPageContainer>
      ) : null}
    </div>
  );
};

export default ChecklistLibrary;
