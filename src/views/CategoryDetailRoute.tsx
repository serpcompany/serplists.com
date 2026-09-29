'use client';

import { useParams } from 'next/navigation';

import { buildCategorySlug } from '@/lib/routes';
import CategoryDetail from '@/views/CategoryDetail';

// Each category starts with an empty search and the default sort. Next.js already gives
// every URL of this route its own page instance; the key, the normalized slug the page
// shows, also restarts the page when it is reused for another category.
const CategoryDetailRoute = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  return <CategoryDetail key={buildCategorySlug(categorySlug ?? 'business')} />;
};

export default CategoryDetailRoute;
