import type { ReactNode } from 'react';

import { Layout } from '@/components/Layout';

// Public pages: the site header and footer.
export default function SiteLayout({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}
