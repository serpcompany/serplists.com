type StateUpdate<T> = T | ((previous: T) => T);
type MountedEffect = { dependencies: readonly unknown[] | undefined; cleanup: (() => void) | undefined };

const slots = { values: [] as unknown[], next: 0, rendering: false, setWhileRendering: false };
const mountedEffects = new Map<number, MountedEffect>();

export function useStateKeptBetweenRenders<T>(initial: T | (() => T)) {
  const slot = slots.next;
  slots.next += 1;
  if (!(slot in slots.values)) {
    slots.values[slot] = typeof initial === 'function' ? (initial as () => T)() : initial;
  }
  const setState = (next: StateUpdate<T>) => {
    slots.values[slot] = typeof next === 'function' ? (next as (previous: T) => T)(slots.values[slot] as T) : next;
    if (slots.rendering) slots.setWhileRendering = true;
  };
  return [slots.values[slot] as T, setState] as const;
}

export function useRefKeptBetweenRenders<T>(initial: T) {
  const [ref] = useStateKeptBetweenRenders(() => ({ current: initial }));
  return ref;
}

const dependenciesChanged = (previous: readonly unknown[] | undefined, next: readonly unknown[] | undefined) =>
  !previous || !next || next.some((dependency, index) => !Object.is(dependency, previous[index]));

export function useEffectKeptBetweenRenders(effect: () => void | (() => void), dependencies?: readonly unknown[]) {
  const slot = slots.next;
  slots.next += 1;
  const mounted = mountedEffects.get(slot);
  if (mounted && !dependenciesChanged(mounted.dependencies, dependencies)) return;
  mounted?.cleanup?.();
  mountedEffects.set(slot, { dependencies, cleanup: effect() ?? undefined });
}

export function unmountEffects() {
  const unmounting = [...mountedEffects.values()];
  mountedEffects.clear();
  for (const effect of unmounting) effect.cleanup?.();
}

export const hooksKeptBetweenRenders = {
  useCallback: <T>(callback: T) => callback,
  useEffect: useEffectKeptBetweenRenders,
  useMemo: <T>(create: () => T) => create(),
  useRef: useRefKeptBetweenRenders,
  useState: useStateKeptBetweenRenders,
  useSyncExternalStore: <T>(_subscribe: unknown, getSnapshot: () => T) => getSnapshot(),
};

export function forgetKeptState() {
  slots.values = [];
  slots.next = 0;
  mountedEffects.clear();
}

export function renderKeepingState<T>(render: () => T): T {
  slots.next = 0;
  return render();
}

export function renderUntilNoStateIsSetDuringRender<T>(render: () => T): T {
  let tree: T;
  do {
    slots.next = 0;
    slots.setWhileRendering = false;
    slots.rendering = true;
    tree = render();
    slots.rendering = false;
  } while (slots.setWhileRendering);
  return tree;
}
