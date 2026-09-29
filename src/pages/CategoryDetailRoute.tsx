import { useParams } from 'react-router-dom';

import { buildCategorySlug } from '@/lib/routes';
import CategoryDetail from '@/pages/CategoryDetail';

// Every category page is the same route, so an unkeyed <CategoryDetail /> would keep one
// instance, with its search text and sort, when a Related Categories link or Back moves to
// another category. The key is the normalized slug, the one the page shows, so another
// letter case or Unicode form of the same category keeps the page.
const CategoryDetailRoute = () => {
  const { categorySlug } = useParams<{ categorySlug: string }>();
  return <CategoryDetail key={buildCategorySlug(categorySlug ?? 'business')} />;
};

export default CategoryDetailRoute;
