const isArray = (value: unknown): value is unknown[] => Array.isArray(value);

export function parseJsonArray(value: unknown): unknown[] | null {
  if (isArray(value)) return value;
  if (typeof value !== 'string') return null;
  try {
    const parsed: unknown = JSON.parse(value);
    return isArray(parsed) ? parsed : null;
  } catch {
    return null;
  }
}

export function normalizeStringArray(value: unknown): string[] {
  const parsed = parseJsonArray(value);
  if (parsed) {
    return parsed.filter((entry): entry is string => typeof entry === 'string' && entry.trim() !== '');
  }
  if (typeof value === 'string' && value.trim()) return [value.trim()];
  return [];
}
