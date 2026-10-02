interface SqlNode {
  name?: unknown;
  queryChunks?: unknown;
  value?: unknown;
}

const isSqlNode = (value: unknown): value is SqlNode => typeof value === 'object' && value !== null;

function unseenNode(value: unknown, seen: Set<unknown>): SqlNode | null {
  if (!isSqlNode(value) || seen.has(value)) return null;
  seen.add(value);
  return value;
}

const queryChunks = (node: SqlNode): unknown[] => (Array.isArray(node.queryChunks) ? node.queryChunks : []);

export function columnNamesIn(sqlExpression: unknown, seen = new Set<unknown>()): string[] {
  const node = unseenNode(sqlExpression, seen);
  if (!node) return [];
  const own = typeof node.name === 'string' ? [node.name] : [];
  return [...own, ...queryChunks(node).flatMap((chunk) => columnNamesIn(chunk, seen))];
}

export function paramValuesIn(sqlExpression: unknown, seen = new Set<unknown>()): unknown[] {
  const node = unseenNode(sqlExpression, seen);
  if (!node) return [];
  const own = 'encoder' in node && 'value' in node ? [node.value] : [];
  return [...own, ...queryChunks(node).flatMap((chunk) => paramValuesIn(chunk, seen))];
}
