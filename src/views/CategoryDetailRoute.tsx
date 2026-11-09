'use client';

import { useParams } from 'next/navigation';

import { buildCategorySlug } from '@/lib/routes';
import CategoryDetail from '@/views/CategoryDetail';

const CategoryDetailRoute = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  return <CategoryDetail key={buildCategorySlug(categorySlug ?? 'business')} />;
};

export default CategoryDetailRoute;
