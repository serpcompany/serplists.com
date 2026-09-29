'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef } from 'react';

import { registerLeaveGuard } from './leaveGuard';

// Asks before a page's unsaved work is lost, whichever way the user leaves:
// - links and code that opens another page (sidebar, header, account menu, in-page links and
//   buttons) through the leave-guard registry, which the app's Link and useAppRouter consult.
//   They ask only when the pathname changes: a search or hash change keeps the page mounted;
// - browser Back/Forward, through a same-URL history entry pushed above the page's own: the
//   browser lands on the page's entry first (the URL does not change), and the page asks
//   there before going on;
// - signing out, which unmounts the page, through the same registry;
// - reloads, tab closes, and external links through beforeunload.
// A session that ends in the background unmounts the page without asking; `keepWork` then
// keeps the work on this tab (see leaveGuard.ts) and returns true when it did.
// `message` is the question asked in the app (browsers show their own on unload).
export const useUnsavedChangesGuard = (
  shouldBlock: boolean,
  message: string,
  keepWork?: () => boolean,
) => {
  // Set once the user chose to leave, or the page leaves on its own after its work was kept
  // or saved, so the same exit is not questioned twice.
  const leaveAllowedRef = useRef(false);
  const keepWorkRef = useRef(keepWork);
  keepWorkRef.current = keepWork;
  const pathname = usePathname();

  // A route that keeps the page mounted for another record starts guarded again.
  useEffect(() => {
    leaveAllowedRef.current = false;
  }, [pathname]);

  useEffect(
    () =>
      registerLeaveGuard({
        message,
        shouldConfirm: () => !leaveAllowedRef.current && shouldBlock,
        onLeaveConfirmed: () => {
          leaveAllowedRef.current = true;
        },
        onLeaveCancelled: () => {
          leaveAllowedRef.current = false;
        },
        onSessionEnding: () => keepWorkRef.current?.() ?? false,
      }),
    [shouldBlock, message],
  );

  // Browser Back/Forward. Next.js keeps its own router state in history entries, so the extra
  // entry copies the current one: going back to it renders the same page.
  useEffect(() => {
    if (!shouldBlock) {
      return undefined;
    }

    const holdPage = () => window.history.pushState(window.history.state, '', window.location.href);
    holdPage();

    const handlePopState = () => {
      if (leaveAllowedRef.current) {
        return;
      }
      if (window.confirm(message)) {
        leaveAllowedRef.current = true;
        window.history.back();
      } else {
        holdPage();
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [shouldBlock, message]);

  useEffect(() => {
    if (!shouldBlock) {
      return undefined;
    }

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      if (leaveAllowedRef.current) {
        return;
      }
      event.preventDefault();
      event.returnValue = '';
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [shouldBlock]);

  // allowLeave also covers a full-page redirect (checkout) once the work is kept elsewhere;
  // guardLeave undoes it when that redirect did not happen.
  const allowLeave = useCallback(() => {
    leaveAllowedRef.current = true;
  }, []);
  const guardLeave = useCallback(() => {
    leaveAllowedRef.current = false;
  }, []);

  return { allowLeave, guardLeave };
};
