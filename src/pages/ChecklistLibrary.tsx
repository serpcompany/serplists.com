import React, { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Compass } from 'lucide-react';

import { SearchAndFilters } from '@/components/checklist-library/SearchAndFilters';
import { TemplateCard } from '@/components/checklist-library/TemplateCard';
import { PublicPageContainer } from '@/components/layout/PublicPageLayout';
import { PublicPill } from '@/components/shared/PublicPill';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useTemplateLibrary } from '@/hooks/useTemplateLibrary';
import {
  buildCanonicalPublicTemplatePath,
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
      <PublicPageContainer className="pb-6 pt-10">
        <div className="max-w-3xl">
          <div className="inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1.5 text-sm font-medium text-muted-foreground">
            <Compass className="h-4 w-4" />
            {activeCategoryName ? 'Category collection' : 'Checklist library'}
          </div>

          <h1 className="mt-4 max-w-4xl text-3xl font-semibold text-foreground sm:text-4xl">
            {title ??
              (activeCategoryName
                ? `${activeCategoryName} checklist packs`
                : 'Find the checklist pack that already solved it')}
          </h1>

          <p className="mt-3 max-w-2xl text-sm leading-7 text-muted-foreground sm:text-base">
            {description ??
              (activeCategoryName
                ? `Browse community checklists tagged for ${activeCategoryName.toLowerCase()}, then open the detail page to copy or run them.`
                : 'Explore public process templates, scan what each pack includes, and jump straight into creator-owned detail pages.')}
          </p>

          {activeCategoryName ? (
            <div className="mt-4">
              <PublicPill
                asChild
                tone="subtle"
                className="cursor-pointer"
              >
                <button
                  type="button"
                  onClick={() => navigate(buildPublicTemplatesPath())}
                >
                  Back to all checklists
                </button>
              </PublicPill>
            </div>
          ) : null}
        </div>
      </PublicPageContainer>

      <PublicPageContainer>
        <SearchAndFilters
          resultCount={filteredTemplates.length}
          searchQuery={searchQuery}
          setSearchQuery={setSearchQuery}
          viewMode={viewMode}
          setViewMode={setViewMode}
          allCategories={allCategories}
          selectedCategories={selectedCategories}
          setSelectedCategories={setSelectedCategories}
        />

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
              Browse all checklists
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
            The library currently indexes {templates.length} public checklists
            across {allCategories.length} categories.
          </div>
        </PublicPageContainer>
      ) : null}
    </div>
  );
};

export default ChecklistLibrary;
