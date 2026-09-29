import React from 'react';

import { Badge } from '@/components/ui/badge';
import { buildPublicCategoryPathForSlug } from '@/lib/routes';

import { Link } from '@/components/navigation/Link';

interface CategoryNavigationProps {
  categories: Array<{
    name: string;
    slug: string;
  }>;
  currentCategorySlug?: string;
  title?: string;
}

export const CategoryNavigation: React.FC<CategoryNavigationProps> = ({
  categories,
  currentCategorySlug,
  title = 'Related Categories',
}) => {
  const relatedCategories = categories.filter(
    (category) => category.slug !== currentCategorySlug,
  );

  if (relatedCategories.length === 0) {
    return null;
  }

  return (
    <section className="mt-12">
      <h2 className="mb-4 text-lg font-semibold text-foreground">{title}</h2>
      <div className="flex flex-wrap gap-2">
        {relatedCategories.slice(0, 5).map((category) => (
          <Link key={category.slug} href={buildPublicCategoryPathForSlug(category.slug)}>
            <Badge
              className="border-border px-3 py-1.5 hover:bg-muted"
              variant="outline"
            >
              {category.name}
            </Badge>
          </Link>
        ))}
      </div>
    </section>
  );
};
