// The one slug rule for template, Organization, and category URLs, shared by the page,
// the API, and the sitemap so their URLs always match. Pure: no React or browser APIs.

// Latin letters that Unicode decomposition leaves whole.
const LETTER_FOLDS: Record<string, string> = {
  "ß": "ss",
  "æ": "ae",
  "œ": "oe",
  "ø": "o",
  "đ": "d",
  "ð": "d",
  "ł": "l",
  "þ": "th",
  "ı": "i",
};
const FOLDED_LETTERS = new RegExp(`[${Object.keys(LETTER_FOLDS).join("")}]`, "g");

/** Folds the lowercase Latin letters that NFKD leaves whole ('ß' -> 'ss', 'ø' -> 'o'). */
export const foldLatinLetters = (text: string): string =>
  text.replace(FOLDED_LETTERS, (letter) => LETTER_FOLDS[letter] ?? "");

/**
 * A lowercase `a-z0-9` slug with single hyphens between words. Accented letters fold to
 * their base letter ('Café' -> 'cafe', 'Straße' -> 'strasse'), fullwidth characters and
 * ligatures to ASCII. Other characters are dropped, so punctuation joins its neighbours
 * ('Q&A' -> 'qa') and a title with no Latin letters or digits gives ''. A valid slug is
 * returned unchanged.
 */
export function generateSlug(text: string): string {
  return foldLatinLetters(text.normalize("NFKD").toLowerCase().replace(/\p{M}+/gu, ""))
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}
