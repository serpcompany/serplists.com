function unseenRecord(value: unknown, seen: Set<unknown>): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || seen.has(value)) return null;
  seen.add(value);
  return value as Record<string, unknown>;
}

const queryChunks = (record: Record<string, unknown>): unknown[] => (Array.isArray(record.queryChunks) ? record.queryChunks : []);

export function columnNamesIn(sqlExpression: unknown, seen = new Set<unknown>()): string[] {
  const record = unseenRecord(sqlExpression, seen);
  if (!record) return [];
  const own = typeof record.name === 'string' ? [record.name] : [];
  return [...own, ...queryChunks(record).flatMap((chunk) => columnNamesIn(chunk, seen))];
}

export function paramValuesIn(sqlExpression: unknown, seen = new Set<unknown>()): unknown[] {
  const record = unseenRecord(sqlExpression, seen);
  if (!record) return [];
  const own = 'encoder' in record && 'value' in record ? [record.value] : [];
  return [...own, ...queryChunks(record).flatMap((chunk) => paramValuesIn(chunk, seen))];
}
