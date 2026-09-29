'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { confirmLeave } from './leaveGuard';
import { leavesPage } from './leavesPage';

type NavigateOptions = { scroll?: boolean };

export type AppRouter = {
  /** Opens `href`; returns false when a page with unsaved work kept the user on it. */
  push: (href: string, options?: NavigateOptions) => boolean;
  /** Like push, replacing the current history entry. */
  replace: (href: string, options?: NavigateOptions) => boolean;
  back: () => void;
  refresh: () => void;
};

/**
 * Next.js's router for code that navigates on its own (after a save, a sign-out, or a
 * workspace switch). Like a Link, it asks a page holding unsaved work before opening another
 * page (useUnsavedChangesGuard); browser Back/Forward are guarded by the page itself.
 */
export function useAppRouter(): AppRouter {
  const router = useRouter();
  const pathname = usePathname();

  return useMemo<AppRouter>(() => {
    const guarded =
      (navigate: (href: string, options?: NavigateOptions) => void) =>
      (href: string, options?: NavigateOptions) => {
        if (leavesPage(href, pathname) && !confirmLeave()) return false;
        navigate(href, options);
        return true;
      };
    return {
      push: guarded((href, options) => router.push(href, options)),
      replace: guarded((href, options) => router.replace(href, options)),
      back: () => router.back(),
      refresh: () => router.refresh(),
    };
  }, [router, pathname]);
}
