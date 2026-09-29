'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useIsClient } from '@/hooks/useIsClient';
import { resolveRouteShell } from '@/lib/routes';

// The 404 page's frame. A signed-in user on a missing console path (under /dashboard/) sees the
// 404 in the console shell. Everyone else, and anyone before the session check has answered,
// sees it in the public shell: a signed-out visitor never gets console chrome. Next.js
// prerenders this page once, for /_not-found/, and serves that HTML for every missing path, so
// the server and the first client render both use the public shell (the session is still
// loading then), and the console shell comes only once the browser knows the session.
export function NotFoundLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isClient = useIsClient();
  const { sessionStatus } = useAuth();
  const signedIn = isClient && sessionStatus === 'authenticated';
  const shell = signedIn && resolveRouteShell(pathname) === 'console' ? 'console' : 'public';

  return <Layout shell={shell}>{children}</Layout>;
}
