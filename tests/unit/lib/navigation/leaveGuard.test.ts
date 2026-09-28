import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmLeave,
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

  // Sign out: once signed out the editor unmounts, so the question must come first.
  it('runs an action that leaves the page only after the user confirms', async () => {
    const signOut = vi.fn().mockResolvedValue(true);
    register({ message: 'Unsaved template', shouldConfirm: () => true, onLeaveConfirmed: vi.fn() });

    await expect(leaveAfterConfirmed(signOut, () => false)).resolves.toBe(false);
    expect(signOut).not.toHaveBeenCalled();

    await expect(leaveAfterConfirmed(signOut, () => true)).resolves.toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
  });

  // Sign out waits for the server, which can refuse (a 429 or a 5xx) and keep the user
  // on the page: the page must then ask again, not let the next exit through silently.
  it('asks before an exit that can fail, and asks again after it failed', async () => {
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
