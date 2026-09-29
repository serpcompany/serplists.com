// A page with unsaved changes registers a leave guard (useUnsavedChangesGuard). The app's
// Link and useAppRouter hand it every navigation to another page (leavePage); it also covers
// actions that leave the page without a navigation, such as signing out, which unmounts it,
// and a session that ends in the background, which unmounts it without asking.
export type LeaveMethod = 'push' | 'replace';

export type LeaveGuard = {
  message: string;
  // The answer of the page's last render: true while it holds unsaved work.
  shouldConfirm: () => boolean;
  // Decides a navigation once the page has rendered its latest state (a page that saved and
  // navigated in the same step has not rendered yet, so shouldConfirm still says true): it
  // calls `leave` when the work turns out saved or the user confirms, and drops it otherwise.
  requestLeave?: (leave: () => void) => void;
  // True while the page's own copy of its history entry (pushed so that browser Back first
  // lands on the page) is the current entry: a navigation away replaces it.
  holdsHistoryEntry?: () => boolean;
  // The user chose to leave: the page must not ask again for the same exit.
  onLeaveConfirmed: () => void;
  // The confirmed exit did not happen (a sign-out the server refused), so the page
  // stays and must ask again next time.
  onLeaveCancelled?: () => void;
  // The session ended in the background (another tab signed out, the session expired
  // or was revoked, or another tab signed in as someone else): the page is about to
  // unmount without asking. It keeps its work on this tab, to offer it back after
  // sign-in, and returns true when it did.
  onSessionEnding?: () => boolean;
};

const guards = new Set<LeaveGuard>();

export const registerLeaveGuard = (guard: LeaveGuard): (() => void) => {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
};

const confirmWithWindow = (message: string): boolean => window.confirm(message);

/** True while a page has a leave guard: the app's Link then navigates through leavePage. */
export const hasLeaveGuards = (): boolean => guards.size > 0;

// The guards the user confirmed leaving past, or null when they chose to stay.
const confirmActiveGuards = (
  confirmDialog: (message: string) => boolean,
): LeaveGuard[] | null => {
  const active = Array.from(guards).filter((guard) => guard.shouldConfirm());
  if (active.length === 0) {
    return active;
  }

  if (!confirmDialog(active[0].message)) {
    return null;
  }

  active.forEach((guard) => guard.onLeaveConfirmed());
  return active;
};

// True when nothing is at stake or the user confirmed leaving.
export const confirmLeave = (
  confirmDialog: (message: string) => boolean = confirmWithWindow,
): boolean => confirmActiveGuards(confirmDialog) !== null;

/**
 * Leaves the current page for another through `navigate`, as its leave guard needs: with
 * 'replace' while the page holds its own history entry (so Back from the next page finds the
 * page once), and, while the page may hold unsaved work, only after the page has decided (the
 * work turned out saved, or the user confirmed). Returns true when it navigated right away.
 */
export const leavePage = (method: LeaveMethod, navigate: (method: LeaveMethod) => void): boolean => {
  const active = Array.from(guards);
  const leaveWith: LeaveMethod = active.some((guard) => guard.holdsHistoryEntry?.()) ? 'replace' : method;
  const deciding = active.find((guard) => guard.shouldConfirm() && guard.requestLeave);
  if (deciding?.requestLeave) {
    deciding.requestLeave(() => navigate(leaveWith));
    return false;
  }
  if (!confirmLeave()) {
    return false;
  }
  navigate(leaveWith);
  return true;
};

// For an exit that can still fail after the user confirmed, such as a sign-out that
// waits for the server: `leave` resolves true once the user has left. When it resolves
// false (or throws) the page stays, and the guards the user confirmed past ask again.
export const leaveAfterConfirmed = async (
  leave: () => Promise<boolean>,
  confirmDialog: (message: string) => boolean = confirmWithWindow,
): Promise<boolean> => {
  const confirmed = confirmActiveGuards(confirmDialog);
  if (confirmed === null) {
    return false;
  }

  let left = false;
  try {
    left = await leave();
    return left;
  } finally {
    if (!left) {
      confirmed.forEach((guard) => guard.onLeaveCancelled?.());
    }
  }
};

// Runs just before a background session change unmounts the signed-in pages, while
// they still show the user who typed the work. Only pages with unsaved work are asked,
// and nobody is asked a question. Returns false when a page could not keep its work.
export const keepGuardedWork = (): boolean => {
  let keptAll = true;
  Array.from(guards).forEach((guard) => {
    try {
      if (guard.shouldConfirm() && !guard.onSessionEnding?.()) {
        keptAll = false;
      }
    } catch {
      keptAll = false;
    }
  });
  return keptAll;
};
