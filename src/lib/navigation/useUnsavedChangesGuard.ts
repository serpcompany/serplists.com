import { useCallback, useEffect, useRef } from 'react';
import { type BlockerFunction, useBlocker, useLocation } from 'react-router-dom';

import { registerLeaveGuard } from './leaveGuard';

// Asks before a page's unsaved work is lost, whichever way the user leaves:
// - any route change (sidebar, header, account menu, in-page links and buttons, and
//   browser Back/Forward) through useBlocker, which needs the app's data router. It asks
//   only when the pathname changes: a search or hash change keeps the page mounted;
// - signing out, which unmounts the page, through the leave-guard registry;
// - reloads, tab closes, and external links through beforeunload.
// A session that ends in the background unmounts the page without asking; `keepWork`
// then keeps the work on this tab (see leaveGuard.ts) and returns true when it did.
// `message` is the question asked in the app (browsers show their own on unload).
export const useUnsavedChangesGuard = (
  shouldBlock: boolean,
  message: string,
  keepWork?: () => boolean,
) => {
  // Set once the user chose to leave, or the page leaves on its own after its work was
  // kept or saved, so the same exit is not questioned twice.
  const leaveAllowedRef = useRef(false);
  const keepWorkRef = useRef(keepWork);
  keepWorkRef.current = keepWork;
  const { pathname } = useLocation();

  // A route that keeps the page mounted for another record starts guarded again.
  useEffect(() => {
    leaveAllowedRef.current = false;
  }, [pathname]);

  const blockerFunction = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      !leaveAllowedRef.current && shouldBlock && currentLocation.pathname !== nextLocation.pathname,
    [shouldBlock],
  );
  const blocker = useBlocker(blockerFunction);

  useEffect(() => {
    if (blocker.state !== 'blocked') {
      return;
    }

    // The router asks the blocker from the last render, so a page that saved its work and
    // left in the same step is blocked on the old answer: it goes without a question.
    if (!shouldBlock || leaveAllowedRef.current || window.confirm(message)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message, shouldBlock]);

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

  // allowLeave also covers a full-page redirect (checkout) once the work is kept
  // elsewhere; guardLeave undoes it when that redirect did not happen.
  const allowLeave = useCallback(() => {
    leaveAllowedRef.current = true;
  }, []);
  const guardLeave = useCallback(() => {
    leaveAllowedRef.current = false;
  }, []);

  return { allowLeave, guardLeave };
};
