import { describe, expect, it, vi } from 'vitest';

import {
  DOUBLE_CLICK_MS,
  createJustOpenedGuard,
  isRepeatClick,
  onSingleClick,
} from '@/lib/utils/repeatClick';

describe('isRepeatClick', () => {
  it('lets keyboard and programmatic clicks (detail 0) and single clicks act', () => {
    expect(isRepeatClick({ detail: 0 })).toBe(false);
    expect(isRepeatClick({ detail: 1 })).toBe(false);
  });

  it('flags the second and third click of a double or triple click', () => {
    expect(isRepeatClick({ detail: 2 })).toBe(true);
    expect(isRepeatClick({ detail: 3 })).toBe(true);
  });
});

describe('onSingleClick', () => {
  it('calls the handler for a single click and ignores the repeat', () => {
    const handler = vi.fn();
    const onClick = onSingleClick(handler);

    onClick({ detail: 1 });
    onClick({ detail: 2 });
    onClick({ detail: 0 });

    expect(handler).toHaveBeenCalledTimes(2);
  });
});

describe('createJustOpenedGuard', () => {
  it('keeps a dialog open for the rest of the double click that opened it', () => {
    let now = 1_000;
    const guard = createJustOpenedGuard(() => now);
    guard.markOpened({});

    now += DOUBLE_CLICK_MS - 1;
    const preventDefault = vi.fn();
    guard.onPointerDownOutside({ preventDefault });

    expect(preventDefault).toHaveBeenCalledTimes(1);
  });

  it('lets a later click outside close the dialog as usual', () => {
    let now = 1_000;
    const guard = createJustOpenedGuard(() => now);
    guard.markOpened({});

    now += DOUBLE_CLICK_MS;
    const preventDefault = vi.fn();
    guard.onPointerDownOutside({ preventDefault });

    expect(preventDefault).not.toHaveBeenCalled();
  });

  it('does not block before the dialog has opened, and ignores the unmount call', () => {
    let now = 1_000;
    const guard = createJustOpenedGuard(() => now);
    const preventDefault = vi.fn();
    guard.onPointerDownOutside({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();

    guard.markOpened({});
    now += DOUBLE_CLICK_MS;
    guard.markOpened(null);
    guard.onPointerDownOutside({ preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
  });
});
