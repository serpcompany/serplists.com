export function withoutKeys(value: unknown, keys: readonly string[]): unknown {
  if (Array.isArray(value)) return value.map((entry) => withoutKeys(entry, keys));
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .filter(([key]) => !keys.includes(key))
      .map(([key, entry]) => [key, withoutKeys(entry, keys)]),
  );
}
