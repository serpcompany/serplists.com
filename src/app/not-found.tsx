import type { Metadata } from 'next';

import { NotFoundLayout } from '@/components/NotFoundLayout';
import { buildPageTitle } from '@/lib/brand';
import NotFound from '@/views/NotFound';

export const metadata: Metadata = {
  title: { absolute: buildPageTitle('Page not found') },
  robots: 'noindex, follow',
};

export default function NotFoundPage() {
  return (
    <NotFoundLayout>
      <NotFound />
    </NotFoundLayout>
  );
}
