import { describe, expect, it, vi } from 'vitest';

import {
  DOUBLE_CLICK_MS,
  createJustOpenedGuard,
  ignoreRepeatClicksBriefly,
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
    const cancel = vi.fn();

    expect(guard.onOutsidePress(cancel)).toBe(true);
    expect(cancel).toHaveBeenCalledTimes(1);
  });

  it('lets a later click outside close the dialog as usual', () => {
    let now = 1_000;
    const guard = createJustOpenedGuard(() => now);
    guard.markOpened({});

    now += DOUBLE_CLICK_MS;
    const cancel = vi.fn();

    expect(guard.onOutsidePress(cancel)).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });

  it('does not block before the dialog has opened, and ignores the unmount call', () => {
    let now = 1_000;
    const guard = createJustOpenedGuard(() => now);
    const cancel = vi.fn();
    expect(guard.onOutsidePress(cancel)).toBe(false);
    expect(cancel).not.toHaveBeenCalled();

    guard.markOpened({});
    now += DOUBLE_CLICK_MS;
    guard.markOpened(null);
    expect(guard.onOutsidePress(cancel)).toBe(false);
    expect(cancel).not.toHaveBeenCalled();
  });
});

describe('ignoreRepeatClicksBriefly', () => {
  // A fake window: the capture-phase click listeners it holds, and a manual timer.
  const fakeWindow = () => {
    const listeners = new Set<(event: Event) => void>();
    let timer: (() => void) | undefined;
    let delay: number | undefined;
    return {
      addEventListener: vi.fn((type: string, listener: (event: Event) => void, capture?: boolean) => {
        if (type === 'click' && capture === true) listeners.add(listener);
      }),
      click: (detail: number) => {
        const event = { detail, preventDefault: vi.fn(), stopPropagation: vi.fn() };
        for (const listener of listeners) listener(event as unknown as Event);
        return event;
      },
      delay: () => delay,
      elapse: () => timer?.(),
      listenerCount: () => listeners.size,
      removeEventListener: vi.fn((type: string, listener: (event: Event) => void, capture?: boolean) => {
        if (type === 'click' && capture === true) listeners.delete(listener);
      }),
      schedule: (callback: () => void, ms: number) => {
        timer = callback;
        delay = ms;
      },
    };
  };

  it('swallows the rest of a double click that lands after the page moved under the pointer', () => {
    const target = fakeWindow();
    ignoreRepeatClicksBriefly(target, target.schedule);

    const second = target.click(2);
    const third = target.click(3);

    for (const event of [second, third]) {
      expect(event.preventDefault).toHaveBeenCalledTimes(1);
      expect(event.stopPropagation).toHaveBeenCalledTimes(1);
    }
  });

  it('lets single, keyboard and programmatic clicks through', () => {
    const target = fakeWindow();
    ignoreRepeatClicksBriefly(target, target.schedule);

    for (const detail of [0, 1]) {
      const event = target.click(detail);
      expect(event.preventDefault).not.toHaveBeenCalled();
      expect(event.stopPropagation).not.toHaveBeenCalled();
    }
  });

  it('stops listening once a double click is over', () => {
    const target = fakeWindow();
    ignoreRepeatClicksBriefly(target, target.schedule);

    expect(target.delay()).toBe(DOUBLE_CLICK_MS);
    target.elapse();

    expect(target.listenerCount()).toBe(0);
    expect(target.click(2).preventDefault).not.toHaveBeenCalled();
  });
});
