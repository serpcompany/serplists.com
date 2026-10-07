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
