import type { Metadata } from 'next';

import { NotFoundLayout } from '@/components/NotFoundLayout';
import { buildPageTitle } from '@/lib/brand';
import NotFound from '@/views/NotFound';

// Unknown paths and notFound() answer 404 with this page. No canonical URL: the address is
// not a page.
export const metadata: Metadata = {
  title: { absolute: buildPageTitle('Page not found') },
  robots: 'noindex, follow',
};

// In the public shell, or the console shell for a signed-in user on a missing console path.
export default function NotFoundPage() {
  return (
    <NotFoundLayout>
      <NotFound />
    </NotFoundLayout>
  );
}
