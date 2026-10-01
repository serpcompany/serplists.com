const UNDECOMPOSED_LATIN_LETTER_FOLDS: Record<string, string> = {
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
const FOLDED_LETTERS = new RegExp(`[${Object.keys(UNDECOMPOSED_LATIN_LETTER_FOLDS).join("")}]`, "g");

export const foldLatinLetters = (text: string): string =>
  text.replace(FOLDED_LETTERS, (letter) => UNDECOMPOSED_LATIN_LETTER_FOLDS[letter] ?? "");

export function generateSlug(text: string): string {
  return foldLatinLetters(text.normalize("NFKD").toLowerCase().replace(/\p{M}+/gu, ""))
    .replace(/[^a-z0-9\s-]/g, "")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

const TEMPLATE_ID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const looksLikeTemplateId = (value: string): boolean => TEMPLATE_ID_PATTERN.test(value);
