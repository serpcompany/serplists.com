import type { ReactNode } from 'react';

import { Layout } from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';

export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  );
}
