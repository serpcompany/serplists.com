'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useMemo } from 'react';

import { leavePage, type LeaveMethod, type NavigatedRightAway } from './leaveGuard';
import { leavesPage } from './leavesPage';
import { reportNavigation } from './navigationSignal';

type NavigateOptions = { scroll?: boolean; onLeave?: () => void };

export type AppRouter = {
  push: (href: string, options?: NavigateOptions) => NavigatedRightAway;
  replace: (href: string, options?: NavigateOptions) => NavigatedRightAway;
  back: () => void;
  refresh: () => void;
};

export function useAppRouter(): AppRouter {
  const router = useRouter();
  const pathname = usePathname();

  return useMemo<AppRouter>(() => {
    const navigate = (method: LeaveMethod, href: string, options?: NavigateOptions) => {
      reportNavigation();
      options?.onLeave?.();
      router[method](href, options?.scroll === undefined ? undefined : { scroll: options.scroll });
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
