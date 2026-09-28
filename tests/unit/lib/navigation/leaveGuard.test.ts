import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  confirmLeave,
  registerLeaveGuard,
  runAfterLeaveConfirmed,
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
  it('runs an action that leaves the page only after the user confirms', () => {
    const signOut = vi.fn();
    register({ message: 'Unsaved template', shouldConfirm: () => true, onLeaveConfirmed: vi.fn() });

    expect(runAfterLeaveConfirmed(signOut, () => false)).toBe(false);
    expect(signOut).not.toHaveBeenCalled();

    expect(runAfterLeaveConfirmed(signOut, () => true)).toBe(true);
    expect(signOut).toHaveBeenCalledTimes(1);
  });
});
