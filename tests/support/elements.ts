export class MissingElementError extends Error {
  override name = 'MissingElementError';
}

export function elementAt<T>(list: readonly T[], index: number): T {
  for (const [position, element] of list.entries()) {
    if (position === index) return element;
  }
  throw new MissingElementError(`Expected an element at index ${index}, but the list has ${list.length}.`);
}

export const firstOf = <T>(list: readonly T[]): T => elementAt(list, 0);

export const lastOf = <T>(list: readonly T[]): T => elementAt(list, list.length - 1);

export function onlyElement<T>(list: readonly T[]): T {
  if (list.length !== 1) throw new MissingElementError(`Expected exactly one element, but the list has ${list.length}.`);
  return elementAt(list, 0);
}

export function valueAt<T>(record: Readonly<Record<string, T>>, key: string): T {
  for (const [name, value] of Object.entries(record)) {
    if (name === key) return value;
  }
  throw new MissingElementError(`Expected a value at "${key}", but the keys are: ${Object.keys(record).join(', ')}.`);
}

export function capturedGroup(match: RegExpMatchArray | RegExpExecArray | null, group: number): string {
  const captured = match?.[group];
  if (captured === undefined) {
    throw new MissingElementError(match ? `Group ${group} of "${match[0]}" captured nothing.` : 'The pattern matched nothing.');
  }
  return captured;
}
