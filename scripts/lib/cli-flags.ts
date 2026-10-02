export function flagValueAt(argv: readonly string[], flagIndex: number): string | null {
  if (flagIndex === -1) return null;
  const value = argv[flagIndex + 1];
  return value && !value.startsWith("--") ? value : "";
}
