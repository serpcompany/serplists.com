// The slug of a public category page (/categories/<slug>). The SPA (buildCategorySlug in
// src/lib/routes.ts) and the sitemap (functions/sitemap/shared.ts) both use this, so a
// category's links and its sitemap entry always agree. Keep it framework-free: it is in
// SHARED_FROM_SRC in .dependency-cruiser.cjs.
//
// - Letters and digits of every script are kept, so 'Русский' and '日本語' get their own
//   pages instead of all collapsing to ''.
// - Accents on Latin letters are dropped ('Café' becomes 'cafe'), and Latin letters that
//   do not decompose fold the way template slugs do ('Straße' becomes 'strasse'; see
//   foldLatinLetters in src/lib/utils/slug.ts), so a Latin-script name gets the same slug as
//   generateSlug gives it. Marks in other scripts are kept, because they are part of the
//   letter there (Japanese dakuten, Devanagari vowel signs, Cyrillic й).
// - Compatibility forms fold (full-width 'ＳＥＯ' becomes 'seo'), and any normal form of
//   the same name gives the same slug, so a decomposed (NFD) URL still matches.
// - A name with no letters or digits ('!!!', emoji only) has no slug: ''.
import { foldLatinLetters } from './utils/slug';

const LATIN_LETTER_WITH_MARKS = /(\p{Script=Latin})\p{M}+/gu;
const NOT_SLUG_CHARACTER = /[^\p{L}\p{M}\p{N}\s-]+/gu;
const LETTER_OR_DIGIT = /[\p{L}\p{N}]/u;

export const categorySlug = (name: string): string => {
  const slug = foldLatinLetters(
    name.normalize('NFKD').toLowerCase().replace(LATIN_LETTER_WITH_MARKS, '$1'),
  )
    .replace(NOT_SLUG_CHARACTER, '')
    .trim()
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
    .normalize('NFC');

  return LETTER_OR_DIGIT.test(slug) ? slug : '';
};

/**
 * A template's category names, each once: names are trimmed, blanks dropped, and a name
 * whose slug matches an earlier one ('seo' after 'SEO', 'QA' after 'Q&A') is dropped, so
 * the first spelling wins. Names with no slug ('!!!') are kept once by exact text. One
 * template then counts once toward each category page it appears on.
 */
export const uniqueCategoryNames = (names: readonly string[]): string[] => {
  const seen = new Set<string>();
  const unique: string[] = [];
  for (const raw of names) {
    const name = raw.trim();
    if (!name) continue;
    const key = categorySlug(name) || `text:${name}`;
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(name);
  }
  return unique;
};
