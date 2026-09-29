'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { registerLeaveGuard } from './leaveGuard';

// Asks before a page's unsaved work is lost, whichever way the user leaves:
// - links and code that opens another page (sidebar, header, account menu, in-page links and
//   buttons) through the leave-guard registry, which the app's Link and useAppRouter hand
//   each navigation (leavePage). They ask only when the pathname changes: a search or hash
//   change keeps the page mounted. The page decides after its next render, so a page that
//   saved its work and left in the same step goes without a question;
// - browser Back/Forward, through a copy of the page's history entry pushed above it the
//   first time the page holds unsaved work: Back lands on the page's own entry (the URL does
//   not change), and the page asks there before going on. The copy stays until Back passes
//   it or the page is left (a navigation away replaces it), so saving and editing again
//   never stacks entries, and Back after saving leaves in one step;
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
  // The latest render's values, for handlers that run later.
  const latestRef = useRef({ shouldBlock, message, keepWork });
  // True while the copy of the page's history entry is the current entry.
  const holdingEntryRef = useRef(false);
  // A navigation the app asked to make, decided after the page renders its latest state.
  const pendingLeaveRef = useRef<(() => void) | null>(null);
  const [leaveRequest, setLeaveRequest] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    latestRef.current = { shouldBlock, message, keepWork };
  });

  // A route that keeps the page mounted for another record starts guarded again.
  useEffect(() => {
    leaveAllowedRef.current = false;
  }, [pathname]);

  useEffect(
    () =>
      registerLeaveGuard({
        message,
        shouldConfirm: () => !leaveAllowedRef.current && latestRef.current.shouldBlock,
        requestLeave: (leave) => {
          pendingLeaveRef.current = leave;
          setLeaveRequest((count) => count + 1);
        },
        holdsHistoryEntry: () => holdingEntryRef.current,
        onLeaveConfirmed: () => {
          leaveAllowedRef.current = true;
        },
        onLeaveCancelled: () => {
          leaveAllowedRef.current = false;
        },
        onSessionEnding: () => latestRef.current.keepWork?.() ?? false,
      }),
    [message],
  );

  // Runs after the render that followed the request, with that render's answer.
  useEffect(() => {
    const leave = pendingLeaveRef.current;
    pendingLeaveRef.current = null;
    if (!leave) return;
    if (leaveAllowedRef.current || !shouldBlock || window.confirm(message)) {
      leaveAllowedRef.current = true;
      leave();
    }
  }, [leaveRequest, message, shouldBlock]);

  // Next.js keeps its own router state in history entries, so the copy repeats the current
  // entry: going back to the original renders the same page.
  const holdEntry = useCallback(() => {
    window.history.pushState(window.history.state, '', window.location.href);
    holdingEntryRef.current = true;
  }, []);

  useEffect(() => {
    if (shouldBlock && !holdingEntryRef.current) holdEntry();
  }, [holdEntry, shouldBlock]);

  // Back from the copy: the browser is on the page's own entry now.
  useEffect(() => {
    const handlePopState = () => {
      if (!holdingEntryRef.current) return;
      holdingEntryRef.current = false;
      const { shouldBlock: blocking, message: question } = latestRef.current;
      if (blocking && !leaveAllowedRef.current && !window.confirm(question)) {
        holdEntry();
        return;
      }
      leaveAllowedRef.current = true;
      window.history.back();
    };

    window.addEventListener('popstate', handlePopState);
    return () => {
      window.removeEventListener('popstate', handlePopState);
    };
  }, [holdEntry]);

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
