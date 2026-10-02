import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmLeave,
  keepGuardedWork,
  leaveAfterConfirmed,
  registerLeaveGuard,
} from '@/lib/navigation/leaveGuard';

const cleanups: Array<() => void> = [];
const register = (...args: Parameters<typeof registerLeaveGuard>) => {
  const unregister = registerLeaveGuard(...args);
  cleanups.push(unregister);
  return unregister;
};

afterEach(() => {
  cleanups.splice(0).forEach((cleanup) => cleanup());
});

describe('leave guard', () => {
  it('allows leaving without asking when no page has unsaved changes', () => {
    const confirmDialog = vi.fn(() => false);
    register({ message: 'Unsaved', shouldConfirm: () => false, onLeaveConfirmed: vi.fn() });

    expect(confirmLeave(confirmDialog)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('asks with the page message and keeps the page when the user cancels', () => {
    const onLeaveConfirmed = vi.fn();
    const confirmDialog = vi.fn(() => false);
    register({ message: 'Unsaved template', shouldConfirm: () => true, onLeaveConfirmed });

    expect(confirmLeave(confirmDialog)).toBe(false);
    expect(confirmDialog).toHaveBeenCalledWith('Unsaved template');
    expect(onLeaveConfirmed).not.toHaveBeenCalled();
  });

  it('tells the page the user chose to leave, so it does not ask again', () => {
    const onLeaveConfirmed = vi.fn();
    register({ message: 'Unsaved template', shouldConfirm: () => true, onLeaveConfirmed });

    expect(confirmLeave(() => true)).toBe(true);
    expect(onLeaveConfirmed).toHaveBeenCalledTimes(1);
  });

  it('stops asking once the page unregisters', () => {
    const confirmDialog = vi.fn(() => false);
    const unregister = register({
      message: 'Unsaved template',
      shouldConfirm: () => true,
      onLeaveConfirmed: vi.fn(),
    });
    unregister();

    expect(confirmLeave(confirmDialog)).toBe(true);
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('runs an action that unmounts the page, such as Sign out, only after the user confirms', async () => {
    const signOut = vi.fn().mockResolvedValue(true);
    register({ message: 'Unsaved template', shouldConfirm: () => true, onLeaveConfirmed: vi.fn() });

    await expect(leaveAfterConfirmed(signOut, () => false)).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();

    await expect(leaveAfterConfirmed(signOut, () => true)).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  it('asks before an exit the server can refuse, such as Sign out, and asks again after it failed instead of letting the next exit through', async () => {
    let leaveAllowed = false;
    register({
      message: 'Unsaved template',
      shouldConfirm: () => !leaveAllowed,
      onLeaveConfirmed: () => {
        leaveAllowed = true;
      },
      onLeaveCancelled: () => {
        leaveAllowed = false;
      },
    });
    const signOut = vi.fn().mockResolvedValue(false);

    await expect(leaveAfterConfirmed(signOut, () => false)).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();

    await expect(leaveAfterConfirmed(signOut, () => true)).resolves.toBe(false);
    expect(signOut).toHaveBeenCalledTimes(1);
    expect(leaveAllowed).toBe(false);

    signOut.mockRejectedValueOnce(new Error('offline'));
    await expect(leaveAfterConfirmed(signOut, () => true)).rejects.toThrow('offline');
    expect(leaveAllowed).toBe(false);
  });

  it('lets the page go once the exit succeeds', async () => {
    let leaveAllowed = false;
    const onLeaveCancelled = vi.fn();
    register({
      message: 'Unsaved template',
      shouldConfirm: () => !leaveAllowed,
      onLeaveConfirmed: () => {
        leaveAllowed = true;
      },
      onLeaveCancelled,
    });

    await expect(leaveAfterConfirmed(() => Promise.resolve(true), () => true)).resolves.toBe(true);
    expect(leaveAllowed).toBe(true);
    expect(onLeaveCancelled).not.toHaveBeenCalled();
  });
});

describe('keeping work before the session ends in the background, which unmounts the page without asking', () => {
  it('asks only the pages with unsaved work to keep it, without asking the user', () => {
    const keepDirty = vi.fn(() => true);
    const keepClean = vi.fn(() => true);
    const confirmDialog = vi.fn(() => true);
    register({ message: 'Unsaved', shouldConfirm: () => true, onLeaveConfirmed: vi.fn(), onSessionEnding: keepDirty });
    register({ message: 'Unsaved', shouldConfirm: () => false, onLeaveConfirmed: vi.fn(), onSessionEnding: keepClean });

    expect(keepGuardedWork()).toBe(true);
    expect(keepDirty).toHaveBeenCalledTimes(1);
    expect(keepClean).not.toHaveBeenCalled();
    expect(confirmDialog).not.toHaveBeenCalled();
  });

  it('reports a page that could not keep its work, and still asks the others', () => {
    const keepOther = vi.fn(() => true);
    register({ message: 'Unsaved', shouldConfirm: () => true, onLeaveConfirmed: vi.fn(), onSessionEnding: () => false });
    register({
      message: 'Unsaved',
      shouldConfirm: () => true,
      onLeaveConfirmed: vi.fn(),
      onSessionEnding: () => {
        throw new Error('QuotaExceededError');
      },
    });
    register({ message: 'Unsaved', shouldConfirm: () => true, onLeaveConfirmed: vi.fn(), onSessionEnding: keepOther });

    expect(keepGuardedWork()).toBe(false);
    expect(keepOther).toHaveBeenCalledTimes(1);
  });

  it('counts a page with unsaved work and no way to keep it as lost', () => {
    register({ message: 'Unsaved', shouldConfirm: () => true, onLeaveConfirmed: vi.fn() });

    expect(keepGuardedWork()).toBe(false);
  });

  it('keeps nothing for work the user already chose to leave', () => {
    let leaveAllowed = false;
    const onSessionEnding = vi.fn(() => true);
    register({
      message: 'Unsaved',
      shouldConfirm: () => !leaveAllowed,
      onLeaveConfirmed: () => {
        leaveAllowed = true;
      },
      onSessionEnding,
    });

    expect(confirmLeave(() => true)).toBe(true);
    expect(keepGuardedWork()).toBe(true);
    expect(onSessionEnding).not.toHaveBeenCalled();
  });
});
