import { describe, expect, it } from 'vitest';

import { generateSlug as serverSlug } from '@functions/api/utils/slug';
import { categorySlug } from '@functions/sitemap/shared';
import { generateSlug as clientSlug } from '@/utils/urlHelpers';
import { buildCategorySlug, findCategoryNameBySlug } from '@/lib/routes';

const SLUG_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

// Accented and special Latin letters fold to ASCII instead of disappearing. Punctuation
// between letters is still dropped ('Q&A' -> 'qa'), as before.
const cases: Array<[string, string]> = [
  ['Café Opening Checklist', 'cafe-opening-checklist'],
  ['Umzugscheckliste für Familien', 'umzugscheckliste-fur-familien'],
  ['Crème Brûlée', 'creme-brulee'],
  ['Señor Niño', 'senor-nino'],
  ['Straße', 'strasse'],
  ['STRASSE ẞ', 'strasse-ss'],
  ['Ærø Ferry Łódź', 'aero-ferry-lodz'],
  ['Œuvre Þing Đakovo', 'oeuvre-thing-dakovo'],
  ['İstanbul Trip', 'istanbul-trip'],
  ['ﬁnal ＡＢＣ ２０２６', 'final-abc-2026'],
  ["Mom's List", 'moms-list'],
  ['Q&A Prep', 'qa-prep'],
  ['🚀 Launch Plan', 'launch-plan'],
  ['Список покупок', ''],
  ['   ', ''],
];

describe('one slug rule for templates, Organizations, and categories', () => {
  it.each(cases)('%s -> %s', (input, expected) => {
    expect(serverSlug(input)).toBe(expected);
  });

  it.each(cases)('the page, the API, and the sitemap agree on %s', (input) => {
    expect(clientSlug(input)).toBe(serverSlug(input));
    expect(categorySlug(input)).toBe(serverSlug(input));
    expect(buildCategorySlug(input)).toBe(serverSlug(input));
  });

  it.each(cases)('gives a stored slug back unchanged, so resending it never changes a URL (%s)', (input) => {
    const slug = serverSlug(input);
    expect(serverSlug(slug)).toBe(slug);
    if (slug) expect(slug).toMatch(SLUG_PATTERN);
  });

  it('resolves an accented category from the slug the sitemap lists', () => {
    expect(findCategoryNameBySlug(['Café Guides', 'Growth'], categorySlug('Café Guides'))).toBe('Café Guides');
    expect(categorySlug('Café Guides')).toBe('cafe-guides');
  });
});
