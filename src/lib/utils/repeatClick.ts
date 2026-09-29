// A click's `detail` is its click count: 2 on the second click of a double click, 3 on a
// triple click. Keyboard activation (Enter, Space) and programmatic clicks have 0.
//
// A control that changes what it does after a click (Next Task becomes Mark Complete for
// the next task, Rename becomes Save title) is still under the pointer when the second
// click of a double click lands, so it ignores that click and a double click acts once.

// The longest double-click interval browsers use (the Windows default).
export const DOUBLE_CLICK_MS = 500;

export const isRepeatClick = (event: { detail: number }): boolean => event.detail > 1;

export const onSingleClick =
  (handler: () => void) =>
  (event: { detail: number }): void => {
    if (!isRepeatClick(event)) handler();
  };

// A dialog opened by a click is under the pointer when the rest of that double click lands
// on its overlay, and a dialog closes on a press outside its popup. Pass `markOpened` as the
// popup's ref, and call `onOutsidePress` from the dialog's onOpenChange when it closes for an
// outside press (with the change's cancel), so outside clicks close the dialog only once the
// double click is over.
export const createJustOpenedGuard = (now: () => number = () => Date.now()) => {
  let openedAt = Number.NEGATIVE_INFINITY;

  return {
    markOpened: (node: unknown): void => {
      if (node) openedAt = now();
    },
    onOutsidePress: (cancel: () => void): boolean => {
      if (now() - openedAt >= DOUBLE_CLICK_MS) return false;
      cancel();
      return true;
    },
  };
};

interface ClickTarget {
  addEventListener: (type: 'click', listener: (event: Event) => void, capture: boolean) => void;
  removeEventListener: (type: 'click', listener: (event: Event) => void, capture: boolean) => void;
}

// A page that scrolls under the pointer (the run page scrolling to the task it moved to)
// puts other controls under the rest of that double click. Call right after such a scroll
// with `window`: for DOUBLE_CLICK_MS, repeat clicks anywhere on the page are swallowed in
// the capture phase, before any control acts on them.
export const ignoreRepeatClicksBriefly = (
  target: ClickTarget,
  schedule: (callback: () => void, ms: number) => unknown = setTimeout,
): void => {
  const swallowRepeatClick = (event: Event): void => {
    if (!isRepeatClick(event as MouseEvent)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  target.addEventListener('click', swallowRepeatClick, true);
  schedule(() => target.removeEventListener('click', swallowRepeatClick, true), DOUBLE_CLICK_MS);
};
