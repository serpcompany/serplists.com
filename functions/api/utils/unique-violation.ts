const CAUSES_FOLLOWED = 5;

export function isUniqueViolationOn(error: unknown, tableColumn: string): boolean {
  const column = tableColumn.replaceAll('.', '\\.');
  const violation = new RegExp(`unique constraint failed:[^:\\n]*\\b${column}\\b`, 'i');
  let current: unknown = error;
  for (let depth = 0; depth < CAUSES_FOLLOWED && current instanceof Error; depth += 1) {
    if (violation.test(current.message)) return true;
    current = current.cause;
  }
  return false;
}
