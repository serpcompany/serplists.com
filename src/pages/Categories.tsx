import React, { useMemo } from 'react';
import { ArrowRight, Folder, Tag } from 'lucide-react';
import { Link } from 'react-router-dom';

import {
  IconBadge,
  PageHero,
  PageSection,
  Surface,
} from '@/components/layout/page-shell';
import { Badge } from '@/components/ui/badge';
import { CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useTemplates } from '@/contexts/TemplatesContext';
import { buildPublicCategoryPath } from '@/lib/routes';

interface CategoryData {
  name: string;
  count: number;
  description?: string;
}

const Categories = () => {
  const { templates, templatesLoading } = useTemplates();

  const categories = useMemo((): CategoryData[] => {
    const categoryCount = new Map<string, number>();

    templates
      .filter((t) => t.isPublic === true)
      .forEach((template) => {
        (template.categories || []).forEach((cat) => {
          categoryCount.set(cat, (categoryCount.get(cat) || 0) + 1);
        });
      });

    return Array.from(categoryCount.entries())
      .map(([name, count]) => ({ name, count }))
      .filter((category) => category.count > 0)
      .sort((a, b) => {
        if (b.count !== a.count) return b.count - a.count;
        return a.name.localeCompare(b.name);
      });
  }, [templates]);

  const getCategoryDescription = (categoryName: string): string => {
    const descriptions: Record<string, string> = {
      wedding:
        'Complete wedding planning checklists to ensure your special day goes perfectly',
      moving:
        'Comprehensive moving checklists to help you relocate smoothly and efficiently',
      camping:
        'Essential camping checklists for outdoor adventures and camping trips',
      packing:
        'Detailed packing lists for travel, moving, and various occasions',
      'morning routine':
        'Daily morning routine checklists to start your day productively',
      'home inspection':
        'Professional home inspection checklists for buyers and sellers',
      cooking: 'Step-by-step cooking and recipe checklists for delicious meals',
    };
    return descriptions[categoryName.toLowerCase()] || `Discover ${categoryName} checklists and templates`;
  };

  if (templatesLoading) {
    return (
      <PageSection width="wide">
          <div className="animate-pulse space-y-6">
            <div className="h-8 bg-muted rounded w-64"></div>
            <div className="h-4 bg-muted rounded w-96"></div>
            <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
              {Array.from({ length: 6 }).map((_, i: number) => (
                <div key={i} className="h-32 bg-muted rounded"></div>
              ))}
            </div>
          </div>
      </PageSection>
    );
  }

  return (
    <>
      <PageSection spacing="hero" width="wide">
        <PageHero
          align="center"
          eyebrow="Categories"
          description="Explore checklists organized by category to find exactly what you need."
          title="Browse the checklist library by category."
        />
        <div className="mt-6 flex items-center justify-center gap-2 text-sm text-muted-foreground">
          <Tag className="h-4 w-4" />
          <span>{categories.length} categories available</span>
        </div>
      </PageSection>

      <PageSection className="pt-0" spacing="spacious" width="wide">
        <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
          {categories.map((category) => (
            <Link
              key={category.name}
              to={buildPublicCategoryPath(category.name)}
            >
              <Surface
                as="article"
                className="h-full transition-transform duration-200 hover:-translate-y-0.5"
                tone="docs"
              >
                <CardHeader className="space-y-4 pb-3">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <IconBadge size="sm">
                        <Folder className="h-5 w-5" />
                      </IconBadge>
                      <CardTitle className="text-lg capitalize">
                        {category.name}
                      </CardTitle>
                    </div>
                    <Badge className="ml-2" variant="secondary">
                      {category.count}
                    </Badge>
                  </div>
                </CardHeader>
                <CardContent>
                  <CardDescription className="mb-4 line-clamp-2">
                    {getCategoryDescription(category.name)}
                  </CardDescription>
                  <div className="flex items-center justify-between">
                    <span className="text-sm text-muted-foreground">
                      {category.count}{' '}
                      {category.count === 1 ? 'checklist' : 'checklists'}
                    </span>
                    <ArrowRight className="h-4 w-4 text-muted-foreground" />
                  </div>
                </CardContent>
              </Surface>
            </Link>
          ))}
        </div>

        {categories.length === 0 ? (
          <Surface className="text-center" padding="xl" tone="glass">
            <Folder className="mx-auto mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold">No categories found</h3>
            <p className="mt-2 text-muted-foreground">
              Categories will appear here as checklists are created.
            </p>
          </Surface>
        ) : null}
      </PageSection>
    </>
  );
};

export default Categories;
