export const normalizeDisplayText = (value: string): string =>
  value.replace(/\\n/g, "\n");

export const normalizeMarkdownDisplayText = normalizeDisplayText;
