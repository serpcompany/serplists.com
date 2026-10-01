'use client';

import { usePathname } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';

import { registerLeaveGuard } from './leaveGuard';

const HELD_ENTRY_KEY = '__serplistsHeldEntry';

type HeldEntry = { token: string; href: string };

let heldEntryCount = 0;

const tokenUniqueAcrossPageLoads = (): string => {
  heldEntryCount += 1;
  return `${Date.now().toString(36)}-${heldEntryCount}`;
};

const isHeldEntry = (state: unknown, held: HeldEntry): boolean =>
  typeof state === 'object' &&
  state !== null &&
  (state as Record<string, unknown>)[HELD_ENTRY_KEY] === held.token;

const isBackPastHeldEntry = (event: PopStateEvent, held: HeldEntry): boolean =>
  !isHeldEntry(event.state, held) && window.location.href === held.href;

const pushCopyOfCurrentEntry = (): HeldEntry => {
  const held = { token: tokenUniqueAcrossPageLoads(), href: window.location.href };
  window.history.pushState({ ...window.history.state, [HELD_ENTRY_KEY]: held.token }, '', held.href);
  return held;
};

const useBeforeUnloadWarning = (shouldBlock: boolean, leaveAllowedRef: { current: boolean }) => {
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
  }, [leaveAllowedRef, shouldBlock]);
};

export const useUnsavedChangesGuard = (
  shouldBlock: boolean,
  message: string,
  keepWork?: () => boolean,
) => {
  const leaveAllowedRef = useRef(false);
  const latestRenderRef = useRef({ shouldBlock, message, keepWork });
  const heldEntryRef = useRef<HeldEntry | null>(null);
  const leaveAwaitingRenderRef = useRef<(() => void) | null>(null);
  const [leaveRequest, setLeaveRequest] = useState(0);
  const pathname = usePathname();

  useEffect(() => {
    latestRenderRef.current = { shouldBlock, message, keepWork };
  });

  useEffect(() => {
    leaveAllowedRef.current = false;
  }, [pathname]);

  useEffect(
    () =>
      registerLeaveGuard({
        message,
        shouldConfirm: () => !leaveAllowedRef.current && latestRenderRef.current.shouldBlock,
        requestLeave: (leave) => {
          leaveAwaitingRenderRef.current = leave;
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
        onSessionEnding: () => latestRenderRef.current.keepWork?.() ?? false,
      }),
    [message],
  );

  useEffect(() => {
    const leave = leaveAwaitingRenderRef.current;
    leaveAwaitingRenderRef.current = null;
    if (!leave) return;
    if (leaveAllowedRef.current || !shouldBlock || window.confirm(message)) {
      leaveAllowedRef.current = true;
      leave();
    }
  }, [leaveRequest, message, shouldBlock]);

  const holdEntry = useCallback(() => {
    heldEntryRef.current = pushCopyOfCurrentEntry();
  }, []);

  useEffect(() => {
    if (shouldBlock && !heldEntryRef.current) holdEntry();
  }, [holdEntry, shouldBlock]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      const held = heldEntryRef.current;
      if (!held || !isBackPastHeldEntry(event, held)) return;
      heldEntryRef.current = null;
      const { shouldBlock: blocking, message: question } = latestRenderRef.current;
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

  useBeforeUnloadWarning(shouldBlock, leaveAllowedRef);

  const allowLeave = useCallback(() => {
    leaveAllowedRef.current = true;
  }, []);
  const guardLeave = useCallback(() => {
    leaveAllowedRef.current = false;
  }, []);

  return { allowLeave, guardLeave };
};
