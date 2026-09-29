'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { registerLeaveGuard } from './leaveGuard';

// The page's copy of its history entry carries this key, so a popstate onto the copy (Back
// from a #fragment the page moved to) is told apart from Back past it onto the page's own
// entry. Next.js keeps other keys of an entry's state.
const HELD_ENTRY_KEY = '__serplistsHeldEntry';

type HeldEntry = { token: string; href: string };

let heldEntryCount = 0;

const isHeldEntry = (state: unknown, held: HeldEntry): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Record<string, unknown>)[HELD_ENTRY_KEY] === held.token;

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
  // The copy of the page's history entry, from when the page first holds unsaved work until
  // Back passes it.
  const heldEntryRef = useRef<HeldEntry | null>(null);
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
        holdsHistoryEntry: () => {
          const held = heldEntryRef.current;
          return held !== null && isHeldEntry(window.history.state, held);
        },
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
    // Unique across page loads too: a reload keeps the entries an earlier copy left.
    heldEntryCount += 1;
    const held = { token: `${Date.now().toString(36)}-${heldEntryCount}`, href: window.location.href };
    window.history.pushState({ ...window.history.state, [HELD_ENTRY_KEY]: held.token }, '', held.href);
    heldEntryRef.current = held;
  }, []);

  useEffect(() => {
    if (shouldBlock && !heldEntryRef.current) holdEntry();
  }, [holdEntry, shouldBlock]);

  // Back past the copy: the browser is on the page's own entry now.
  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const held = heldEntryRef.current;
      if (!held) return;
      // Back onto the copy, from a #fragment the page moved to: still on the page.
      if (isHeldEntry(event.state, held)) return;
      // A #fragment above the copy (or an entry with another URL): not Back past the copy.
      if (window.location.href !== held.href) return;
      heldEntryRef.current = null;
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
