export function normalizeEol(text: string): string {
  return text.replace(/\r\n/g, "\n");
}

export function matchesGeneratedText(existing: string | null | undefined, generated: string): boolean {
  return existing !== null && existing !== undefined && normalizeEol(existing) === normalizeEol(generated);
}
