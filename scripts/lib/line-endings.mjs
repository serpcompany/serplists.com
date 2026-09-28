// Line-ending helpers for checks that compare a committed file with freshly
// generated output. .gitattributes checks text files out with LF, but a clone made
// before it existed, or an editor that saves CRLF, can still hand a check CRLF text.
// Generators always write LF; only the comparison ignores the difference.

/** CRLF to LF. Lone CR and escaped "\r\n" sequences inside strings are left alone. */
export function normalizeEol(text) {
  return text.replace(/\r\n/g, "\n");
}

/**
 * True when the committed file matches the generated text apart from CRLF vs LF.
 * A missing file (null) never matches. Everything else, including a missing final
 * newline, still counts as drift.
 */
export function matchesGeneratedText(existing, generated) {
  return existing !== null && existing !== undefined && normalizeEol(existing) === normalizeEol(generated);
}
