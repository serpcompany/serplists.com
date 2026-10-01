type StateUpdate<T> = T | ((previous: T) => T);

const slots = { values: [] as unknown[], next: 0, rendering: false, setWhileRendering: false };

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

export function forgetKeptState() {
  slots.values = [];
  slots.next = 0;
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
