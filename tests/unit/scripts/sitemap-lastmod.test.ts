import { describe, expect, it } from 'vitest';

import {
  deriveCommittedDates,
  hashJson,
  inventoryHashes,
  listPublicTemplates,
  parseTemplatePack,
  resolveLastmod,
} from '../../../scripts/lib/sitemapLastmod';

const template = (slug: string, task: string, visibility = 'public') => ({ slug, visibility, categories: ['SEO'], task });
const snapshot = (date: string, templates: Array<Record<string, unknown>>, categoriesSource = '') => ({
  date,
  packs: [{ templates }],
  categoriesSource,
});

describe('deriveCommittedDates', () => {
  it('dates each template by the commit that last changed it, not by its siblings', () => {
    const dates = deriveCommittedDates([
      snapshot('2026-01-01T00:00:00.000Z', [template('a', 'one'), template('b', 'one')]),
      snapshot('2026-02-01T00:00:00.000Z', [template('a', 'two'), template('b', 'one')]),
    ]);

    expect(dates.templates.get('a')).toEqual({ hash: hashJson(template('a', 'two')), lastmod: '2026-02-01T00:00:00.000Z' });
    expect(dates.templates.get('b')?.lastmod).toBe('2026-01-01T00:00:00.000Z');
    expect(dates.templatesInventory?.lastmod).toBe('2026-02-01T00:00:00.000Z');
  });

  it('counts a template made public again, and a removal, as changes', () => {
    const dates = deriveCommittedDates([
      snapshot('2026-01-01T00:00:00.000Z', [template('a', 'one'), template('b', 'one')]),
      snapshot('2026-02-01T00:00:00.000Z', [template('a', 'one', 'private'), template('b', 'one')]),
      snapshot('2026-03-01T00:00:00.000Z', [template('a', 'one')]),
    ]);

    expect(dates.templates.get('a')?.lastmod).toBe('2026-03-01T00:00:00.000Z');
    expect(dates.templates.has('b')).toBe(false);
    expect(dates.templatesInventory?.lastmod).toBe('2026-03-01T00:00:00.000Z');
  });

  it('dates the categories inventory by category list changes too', () => {
    const dates = deriveCommittedDates([
      snapshot('2026-01-01T00:00:00.000Z', [template('a', 'one')], 'export const categories = [];\n'),
      snapshot('2026-02-01T00:00:00.000Z', [template('a', 'one')], 'export const categories = ["SEO"];\n'),
    ]);

    expect(dates.templates.get('a')?.lastmod).toBe('2026-01-01T00:00:00.000Z');
    expect(dates.templatesInventory?.lastmod).toBe('2026-01-01T00:00:00.000Z');
    expect(dates.categoriesInventory?.lastmod).toBe('2026-02-01T00:00:00.000Z');
  });

  it('has no dates without history', () => {
    expect(deriveCommittedDates([])).toEqual({ templates: new Map(), templatesInventory: null, categoriesInventory: null });
  });
});

describe('resolveLastmod', () => {
  const now = '2026-09-28T12:00:00.000Z';

  it('uses the commit date for committed content, even when the previous catalog holds an older date', () => {
    expect(
      resolveLastmod({
        hash: 'h2',
        committed: { hash: 'h2', lastmod: '2026-02-01T00:00:00.000Z' },
        previous: { hash: 'h2', lastmod: '2026-01-01T00:00:00.000Z' },
        now,
      }),
    ).toBe('2026-02-01T00:00:00.000Z');
  });

  it('never gives an uncommitted edit the previous commit date', () => {
    expect(
      resolveLastmod({
        hash: 'h2',
        committed: { hash: 'h1', lastmod: '2026-01-01T00:00:00.000Z' },
        previous: { hash: 'h1', lastmod: '2026-01-01T00:00:00.000Z' },
        now,
      }),
    ).toBe(now);
    expect(resolveLastmod({ hash: 'h3', committed: undefined, previous: undefined, now })).toBe(now);
  });

  it('keeps the first local date while an uncommitted edit stays the same', () => {
    expect(
      resolveLastmod({
        hash: 'h2',
        committed: { hash: 'h1', lastmod: '2026-01-01T00:00:00.000Z' },
        previous: { hash: 'h2', lastmod: '2026-09-28T11:00:00.000Z' },
        now,
      }),
    ).toBe('2026-09-28T11:00:00.000Z');
  });
});

describe('catalog hashes', () => {
  it('lists public templates by slug and ignores private or unnamed ones', () => {
    const templates = listPublicTemplates([
      { templates: [template('b', 'x'), template('hidden', 'x', 'private'), { visibility: 'public' }] },
      { templates: [template('a', 'x')] },
    ]);

    expect(templates.map(({ slug }) => slug)).toEqual(['a', 'b']);
    expect(templates[0]).toEqual({ slug: 'a', categories: ['SEO'], contentHash: hashJson(template('a', 'x')) });
  });

  it('hashes the category list the same with either line ending', () => {
    const templates = listPublicTemplates([{ templates: [template('a', 'x')] }]);

    expect(inventoryHashes(templates, 'a\r\nb\r\n')).toEqual(inventoryHashes(templates, 'a\nb\n'));
  });

  it('parses only template packs', () => {
    expect(parseTemplatePack('{"templates":[{"slug":"a"}]}')).toEqual({ templates: [{ slug: 'a' }] });
    expect(parseTemplatePack('{"templates":"nope"}')).toBeNull();
    expect(parseTemplatePack('not json')).toBeNull();
    expect(parseTemplatePack(null)).toBeNull();
  });
});
