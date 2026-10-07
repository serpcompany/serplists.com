'use client';

import type { ReactNode } from 'react';
import { usePathname } from 'next/navigation';

import { Layout } from '@/components/Layout';
import { useAuth } from '@/contexts/CloudflareAuthContext';
import { useIsClient } from '@/hooks/useIsClient';
import { resolveRouteShell } from '@/lib/routes';

export function NotFoundLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const isClient = useIsClient();
  const { sessionStatus } = useAuth();
  const signedIn = isClient && sessionStatus === 'authenticated';
  const shell = signedIn && resolveRouteShell(pathname) === 'console' ? 'console' : 'public';

  return <Layout shell={shell}>{children}</Layout>;
}
