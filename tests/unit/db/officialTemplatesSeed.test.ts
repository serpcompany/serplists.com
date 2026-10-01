import { readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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

const jsonArrayLiteralsInTheSeedSql = (sql: string): unknown[] =>
  Array.from(sql.matchAll(/'(\[(?:[^']|'')*\])'/g), (match) =>
    JSON.parse(match[1].replace(/''/g, "'")),
  );

const findLiteralBackslashN = (value: unknown, label: string) =>
  collectStrings(value, label, [])
    .filter(([, text]) => text.includes(LITERAL_BACKSLASH_N))
    .map(([path]) => path);

describe('official template seed', () => {
  const sql = readFileSync('db/seeds/official-templates.sql', 'utf8');
  const columns = jsonArrayLiteralsInTheSeedSql(sql);

  it('parses every templates.items payload', () => {
    expect(columns.length).toBeGreaterThanOrEqual(5);
  });

  it('stores real line breaks, never the literal backslash-n a doubled escape in the SQL stores', () => {
    const offenders = columns.flatMap((column, index) =>
      findLiteralBackslashN(column, `items#${index}`),
    );

    expect(offenders).toEqual([]);
    expect(columns.some((column) => collectStrings(column, '', []).some(([, text]) => text.includes('\n')))).toBe(true);
  });
});

describe('bundled public template packs', () => {
  it('store real line breaks, never a literal backslash-n, which code and Windows paths would then show', () => {
    const pack: unknown = JSON.parse(
      readFileSync('src/data/public-template-packs/foundational-checklists.json', 'utf8'),
    );

    expect(findLiteralBackslashN(pack, 'pack')).toEqual([]);
  });
});
