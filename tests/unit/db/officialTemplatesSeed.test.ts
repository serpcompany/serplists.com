import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

// The official seed once wrote its JSON with doubled escapes ("\\n" inside the SQL
// literal), so every text block decoded to a literal backslash-n instead of a line break,
// and the app rewrote every backslash-n on display, corrupting code and Windows paths.
// Seeds and bundled packs must store real line breaks.

const LITERAL_BACKSLASH_N = '\\n';

const collectStrings = (value: unknown, path: string, out: Array<[string, string]>) => {
  if (typeof value === 'string') {
    out.push([path, value]);
  } else if (Array.isArray(value)) {
    value.forEach((entry, index) => collectStrings(entry, `${path}[${index}]`, out));
  } else if (value && typeof value === 'object') {
    for (const [key, entry] of Object.entries(value)) collectStrings(entry, `${path}.${key}`, out);
  }
  return out;
};

// SQL string literals holding a JSON array (the templates' items column).
const readSeedJsonColumns = (sql: string): unknown[] =>
  Array.from(sql.matchAll(/'(\[(?:[^']|'')*\])'/g), (match) =>
    JSON.parse(match[1].replace(/''/g, "'")),
  );

const findLiteralBackslashN = (value: unknown, label: string) =>
  collectStrings(value, label, [])
    .filter(([, text]) => text.includes(LITERAL_BACKSLASH_N))
    .map(([path]) => path);

describe('official template seed', () => {
  const sql = readFileSync('db/seeds/official-templates.sql', 'utf8');
  const columns = readSeedJsonColumns(sql);

  it('parses every templates.items payload', () => {
    expect(columns.length).toBeGreaterThanOrEqual(5);
  });

  it('stores real line breaks, never a literal backslash-n', () => {
    const offenders = columns.flatMap((column, index) =>
      findLiteralBackslashN(column, `items#${index}`),
    );

    expect(offenders).toEqual([]);
    expect(columns.some((column) => collectStrings(column, '', []).some(([, text]) => text.includes('\n')))).toBe(true);
  });
});

describe('bundled public template packs', () => {
  it('store real line breaks, never a literal backslash-n', () => {
    const pack: unknown = JSON.parse(
      readFileSync('src/data/public-template-packs/foundational-checklists.json', 'utf8'),
    );

    expect(findLiteralBackslashN(pack, 'pack')).toEqual([]);
  });
});
