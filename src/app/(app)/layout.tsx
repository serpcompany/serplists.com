import type { ReactNode } from 'react';

import { Layout } from '@/components/Layout';
import RequireAuth from '@/components/RequireAuth';

// Signed-in pages: the console shell, after the session check (RequireAuth sends a signed-out
// visitor to /login and back here after sign-in).
export default function AppLayout({ children }: { children: ReactNode }) {
  return (
    <RequireAuth>
      <Layout>{children}</Layout>
    </RequireAuth>
  );
}
