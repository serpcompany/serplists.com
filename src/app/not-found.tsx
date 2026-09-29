import type { Metadata } from 'next';

import { Layout } from '@/components/Layout';
import { buildPageTitle } from '@/lib/brand';
import NotFound from '@/views/NotFound';

// Unknown paths and notFound() answer 404 with this page. No canonical URL: the address is
// not a page.
export const metadata: Metadata = {
  title: { absolute: buildPageTitle('Page not found') },
  robots: 'noindex, follow',
};

export default function NotFoundPage() {
  return (
    <Layout>
      <NotFound />
    </Layout>
  );
}
