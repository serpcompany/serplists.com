'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { leavePage, type LeaveMethod } from './leaveGuard';
import { leavesPage } from './leavesPage';
import { reportNavigation } from './navigationSignal';

type NavigateOptions = { scroll?: boolean };

export type AppRouter = {
  /**
   * Opens `href`; returns false when a page with unsaved work took the navigation over (it
   * opens `href` itself if its work turns out saved or the user confirms).
   */
  push: (href: string, options?: NavigateOptions) => boolean;
  /** Like push, replacing the current history entry. */
  replace: (href: string, options?: NavigateOptions) => boolean;
  back: () => void;
  refresh: () => void;
};

/**
 * Next.js's router for code that navigates on its own (after a save, a sign-out, or a
 * workspace switch). Like a Link, it hands a page holding unsaved work (useUnsavedChangesGuard)
 * every navigation to another page; browser Back/Forward are guarded by the page itself.
 */
export function useAppRouter(): AppRouter {
  const router = useRouter();
  const pathname = usePathname();

  return useMemo<AppRouter>(() => {
    const navigate = (method: LeaveMethod, href: string, options?: NavigateOptions) => {
      reportNavigation();
      router[method](href, options);
    };
    const guarded = (method: LeaveMethod) => (href: string, options?: NavigateOptions) => {
      if (!leavesPage(href, pathname)) {
        navigate(method, href, options);
        return true;
      }
      return leavePage(method, (leaveWith) => navigate(leaveWith, href, options));
    };
    return {
      push: guarded('push'),
      replace: guarded('replace'),
      back: () => router.back(),
      refresh: () => router.refresh(),
    };
  }, [router, pathname]);
}
