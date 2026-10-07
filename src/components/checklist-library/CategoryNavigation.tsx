import React from 'react';

import { SectionHeader } from '@/components/layout/SectionHeader';
import { Link } from '@/components/navigation/Link';
import { buttonVariants } from '@/components/ui/button-variants';
import { buildPublicCategoryPathForSlug } from '@/lib/routes';

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
    <section aria-labelledby="related-categories" className="mt-12">
      <SectionHeader id="related-categories" title={title} />
      <div className="flex flex-wrap gap-2">
        {relatedCategories.slice(0, 5).map((category) => (
          <Link
            key={category.slug}
            className={buttonVariants({ variant: 'secondary', size: 'sm' })}
            href={buildPublicCategoryPathForSlug(category.slug)}
          >
            {category.name}
          </Link>
        ))}
      </div>
    </section>
  );
};
