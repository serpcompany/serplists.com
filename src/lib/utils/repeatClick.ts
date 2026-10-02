export const DOUBLE_CLICK_MS = 500;

export const isRepeatClick = (event: { detail: number }): boolean => event.detail > 1;

export const onSingleClick =
  (handler: () => void) =>
  (event: { detail: number }): void => {
    if (!isRepeatClick(event)) handler();
  };

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

type ClickWithDetail = { readonly type: string; readonly detail?: unknown };

const isRepeatClickEvent = (event: ClickWithDetail): boolean =>
  typeof event.detail === 'number' && isRepeatClick({ detail: event.detail });

export const ignoreRepeatClicksBriefly = (
  target: ClickTarget,
  schedule: (callback: () => void, ms: number) => unknown = setTimeout,
): void => {
  const swallowRepeatClick = (event: Event): void => {
    if (!isRepeatClickEvent(event)) return;
    event.preventDefault();
    event.stopPropagation();
  };
  target.addEventListener('click', swallowRepeatClick, true);
  schedule(() => target.removeEventListener('click', swallowRepeatClick, true), DOUBLE_CLICK_MS);
};
