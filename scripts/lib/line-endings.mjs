export function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

export function matchesGeneratedText(existing, generated) {
  return existing !== null && existing !== undefined && normalizeEol(existing) === normalizeEol(generated);
}
