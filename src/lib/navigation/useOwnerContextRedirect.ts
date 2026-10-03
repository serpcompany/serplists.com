'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';

import { buildOwnerContextPath, type ConsoleContext } from '@/lib/consoleRoutes';

import { useAppRouter } from './useAppRouter';

export function useOwnerContextRedirect(ownerContext: ConsoleContext | null): boolean {
  const pathname = usePathname();
  const router = useAppRouter();
  const destination = ownerContext === null ? null : buildOwnerContextPath(pathname, ownerContext);

  useEffect(() => {
    if (destination === null) return;
    router.replace(`${destination}${window.location.search}${window.location.hash}`);
  }, [destination, router]);

  return destination !== null;
}
