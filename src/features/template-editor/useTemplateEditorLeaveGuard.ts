import { useCallback, useEffect, useRef } from "react";
import { type BlockerFunction, useBlocker, useLocation } from "react-router-dom";

import {
  applyTemplateBeforeUnloadWarning,
  confirmTemplateEditorNavigation,
  EDITOR_UNSAVED_CHANGES_MESSAGE,
  shouldBlockTemplateEditorTransition,
} from "@/features/template-editor/navigationGuards";
import { registerLeaveGuard } from "@/lib/navigation/leaveGuard";

// Asks before unsaved template edits are lost, whichever way the user leaves:
// - any route change (sidebar, header, account menu, the editor's back button, and
//   browser Back/Forward) through useBlocker, which needs the app's data router;
// - signing out, which unmounts the editor, through the leave-guard registry;
// - reloads, tab closes, and external links through beforeunload.
// A session that ends in the background unmounts the editor without asking; `keepWork`
// then keeps the edits on this tab (see leaveGuard.ts) and returns true when it did.
// `message` is the question asked in the app (browsers show their own on unload).
export const useTemplateEditorLeaveGuard = (
  shouldBlock: boolean,
  message: string = EDITOR_UNSAVED_CHANGES_MESSAGE,
  keepWork?: () => boolean,
) => {
  // Set once the user chose to leave, or the editor navigates away after a create
  // saved, so the same exit is not questioned twice.
  const leaveAllowedRef = useRef(false);
  const keepWorkRef = useRef(keepWork);
  keepWorkRef.current = keepWork;
  const { pathname } = useLocation();

  // Editor routes share this component, so a new route starts guarded again.
  useEffect(() => {
    leaveAllowedRef.current = false;
  }, [pathname]);

  const blockerFunction = useCallback<BlockerFunction>(
    ({ currentLocation, nextLocation }) =>
      !leaveAllowedRef.current &&
      shouldBlockTemplateEditorTransition({
        shouldBlock,
        currentPath: currentLocation.pathname,
        nextPath: nextLocation.pathname,
      }),
    [shouldBlock],
  );
  const blocker = useBlocker(blockerFunction);

  useEffect(() => {
    if (blocker.state !== "blocked") {
      return;
    }

    if (confirmTemplateEditorNavigation(true, undefined, message)) {
      blocker.proceed();
    } else {
      blocker.reset();
    }
  }, [blocker, message]);

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
      applyTemplateBeforeUnloadWarning(event, shouldBlock && !leaveAllowedRef.current);
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [shouldBlock]);

  // allowLeave also covers a full-page redirect (checkout) once the edits are kept
  // elsewhere; guardLeave undoes it when that redirect did not happen.
  const allowLeave = useCallback(() => {
    leaveAllowedRef.current = true;
  }, []);
  const guardLeave = useCallback(() => {
    leaveAllowedRef.current = false;
  }, []);

  return { allowLeave, guardLeave };
};
