import { describe, expect, it } from 'vitest';

import { describeDuplicate, type Duplicate, findDuplicates } from '../../../../scripts/checks/duplicates';
import { duplicateProblems } from '../../../../scripts/checks/known-duplicates';
import { scratchFolder, writeFiles } from './scratch';

const repeated = (name: string) => `export function ${name}(rows: { id: number; title: string; reading: string }[]) {
  const seen = new Set<number>();
  const kept: { id: number; title: string; reading: string }[] = [];
  for (const row of rows) {
    if (seen.has(row.id)) continue;
    seen.add(row.id);
    kept.push({ ...row, title: row.title.trim(), reading: row.reading.normalize('NFKC') });
  }
  return kept.sort((left, right) => left.title.localeCompare(right.title) || left.id - right.id);
}
`;

function duplicatesIn(files: Readonly<Record<string, string>>) {
  const root = scratchFolder('duplicates');
  writeFiles(root, files);
  const folders = [...new Set(Object.keys(files).map((file) => file.split('/')[0] ?? file))];
  return findDuplicates(root, folders).map(describeDuplicate);
}

describe('jscpd over the folders that hold code', { timeout: 60_000 }, () => {
  it('finds a block repeated across files and folders, a bracketed route file included, and names both places', () => {
    expect(duplicatesIn({ 'src/app/[slug]/page.ts': repeated('uniqueWords'), 'tests/rows.ts': `export const site = 1;\n\n${repeated('uniqueRows')}` })).toEqual([
      'src/app/[slug]/page.ts:1-10  repeats tests/rows.ts:3-12 (10 lines)',
    ]);
  });

  it('passes code that says each thing once', () => {
    expect(duplicatesIn({ 'src/only.ts': repeated('uniqueRows'), 'src/other.ts': 'export const greeting = (name: string) => `Hello, ${name}`;\n' })).toEqual([]);
  });
});

const clone = (first: string, second: string, start = 1): Duplicate => ({
  first: { name: first, start, end: start + 9 },
  second: { name: second, start: start + 20, end: start + 29 },
  lines: 10,
});
const known = { 'src/a.ts and src/b.ts': { blocks: 2, reason: 'a test' } };

describe('the known duplicates', () => {
  it('names a repeated block no entry excepts, when the run covers either side', () => {
    const found = [clone('src/c.ts', 'src/d.ts')];
    expect(duplicateProblems(found, [], {})).toEqual(['src/c.ts:1-10  repeats src/d.ts:21-30 (10 lines)']);
    expect(duplicateProblems(found, ['src/d.ts'], {})).toEqual(['src/c.ts:1-10  repeats src/d.ts:21-30 (10 lines)']);
    expect(duplicateProblems(found, ['scripts'], known)).toEqual([]);
  });

  it('pass a known pair that repeats no more than it did, in either order', () => {
    expect(duplicateProblems([clone('src/b.ts', 'src/a.ts'), clone('src/a.ts', 'src/b.ts', 40)], [], known)).toEqual([]);
  });

  it('fail a known pair that repeats more', () => {
    const found = [clone('src/a.ts', 'src/b.ts'), clone('src/a.ts', 'src/b.ts', 40), clone('src/a.ts', 'src/b.ts', 80)];
    expect(duplicateProblems(found, [], known).at(-1)).toBe('src/a.ts and src/b.ts  repeat 3 blocks, more than the 2 knownDuplicates allows');
  });

  it('ask to lower the count as blocks are shared, and to drop the pair at none', () => {
    expect(duplicateProblems([clone('src/a.ts', 'src/b.ts')], [], known)).toEqual(['src/a.ts and src/b.ts  repeat 1 blocks now: lower knownDuplicates to 1']);
    expect(duplicateProblems([], [], known)).toEqual(['src/a.ts and src/b.ts  no longer repeat each other: remove them from knownDuplicates']);
  });

  it('refuse an exception without a reason', () => {
    expect(duplicateProblems([clone('src/a.ts', 'src/b.ts')], [], { 'src/a.ts and src/b.ts': { blocks: 1, reason: ' ' } })).toEqual([
      'src/a.ts and src/b.ts  are excepted without a reason: give them one, or share the code',
    ]);
  });
});
