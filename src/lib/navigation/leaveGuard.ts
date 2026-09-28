// A page with unsaved changes registers a leave guard. Route changes are blocked by
// the page itself (useBlocker); this covers actions that leave the page without a
// navigation the page can block first, such as signing out, which unmounts it.
export type LeaveGuard = {
  message: string;
  shouldConfirm: () => boolean;
  // The user chose to leave: the page must not ask again for the same exit.
  onLeaveConfirmed: () => void;
};

const guards = new Set<LeaveGuard>();

export const registerLeaveGuard = (guard: LeaveGuard): (() => void) => {
  guards.add(guard);
  return () => {
    guards.delete(guard);
  };
};

const confirmWithWindow = (message: string): boolean => window.confirm(message);

// True when nothing is at stake or the user confirmed leaving.
export const confirmLeave = (
  confirmDialog: (message: string) => boolean = confirmWithWindow,
): boolean => {
  const active = Array.from(guards).filter((guard) => guard.shouldConfirm());
  if (active.length === 0) {
    return true;
  }

  if (!confirmDialog(active[0].message)) {
    return false;
  }

  active.forEach((guard) => guard.onLeaveConfirmed());
  return true;
};

export const runAfterLeaveConfirmed = (
  action: () => void,
  confirmDialog?: (message: string) => boolean,
): boolean => {
  if (!confirmLeave(confirmDialog)) {
    return false;
  }

  action();
  return true;
};
