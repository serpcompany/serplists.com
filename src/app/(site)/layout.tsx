import type { ReactNode } from 'react';

import { Layout } from '@/components/Layout';

export default function SiteLayout({ children }: { children: ReactNode }) {
  return <Layout>{children}</Layout>;
}
