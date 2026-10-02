export type LeaveMethod = 'push' | 'replace';

export type NavigatedRightAway = boolean;

export type LeaveGuard = {
  message: string;
  shouldConfirm: () => boolean;
  requestLeave?: (leave: () => void) => void;
  holdsHistoryEntry?: () => boolean;
  onLeaveConfirmed: () => void;
  onLeaveCancelled?: () => void;
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

export const hasLeaveGuards = (): boolean => guards.size > 0;

type LeaveAnswer = { stays: true } | { stays: false; confirmedGuards: LeaveGuard[] };

const askActiveGuards = (confirmDialog: (message: string) => boolean): LeaveAnswer => {
  const active = Array.from(guards).filter((guard) => guard.shouldConfirm());
  const [firstActive] = active;
  if (!firstActive) {
    return { stays: false, confirmedGuards: active };
  }

  if (!confirmDialog(firstActive.message)) {
    return { stays: true };
  }

  active.forEach((guard) => guard.onLeaveConfirmed());
  return { stays: false, confirmedGuards: active };
};

export const confirmLeave = (
  confirmDialog: (message: string) => boolean = confirmWithWindow,
): boolean => !askActiveGuards(confirmDialog).stays;

export const leavePage = (
  method: LeaveMethod,
  navigate: (method: LeaveMethod) => void,
): NavigatedRightAway => {
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

export const leaveAfterConfirmed = async (
  leave: () => Promise<boolean>,
  confirmDialog: (message: string) => boolean = confirmWithWindow,
): Promise<boolean> => {
  const answer = askActiveGuards(confirmDialog);
  if (answer.stays) {
    return false;
  }

  let left = false;
  try {
    left = await leave();
    return left;
  } finally {
    if (!left) {
      answer.confirmedGuards.forEach((guard) => guard.onLeaveCancelled?.());
    }
  }
};

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
