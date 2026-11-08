import { describe, expect, it } from 'vitest';

import { docsToReverify, filesNearLimit, namedFiles, scoresToRegrade, summarizeDebt } from '../../../scripts/lib/maintenance-report-lib';

const day = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;

describe('the maintenance report on tables with short rows', () => {
  it('reads a quality row cut short of its Code column as having no code to re-grade, and a row with no cells as an unnamed ungraded one', () => {
    const quality = ['| Area | Graded | Code |', '| --- | --- | --- |', '| Search | 2026-09-30 |', '| Runs | 2026-09-30 | runs, no code spans |', '|'].join('\n');

    expect(scoresToRegrade(quality, new Map([['src/search.ts', day('2026-10-03')]]))).toEqual({ stale: [], ungraded: [''] });
  });

  it('reads a debt row cut short of its Issue and Size columns as unsized, with no issue', () => {
    const debt = ['## Code', '', '| Debt | Issue | Size |', '| --- | --- | --- |', '| A short row. |', '|'].join('\n');

    expect(summarizeDebt(debt).unsized).toEqual([
      { section: 'Code', debt: 'A short row.', issue: '' },
      { section: 'Code', debt: '', issue: '' },
    ]);
  });
});

describe('the maintenance report on docs', () => {
  it('collects only the links of a doc with no code spans, and only the code of a doc with no links', () => {
    const isFile = (path: string) => path === 'src/lib/api.ts' || path === 'scripts/lint.ts';

    expect(namedFiles('docs/agents/a.md', 'The client is [here](/src/lib/api.ts "the client").', isFile)).toEqual(['src/lib/api.ts']);
    expect(namedFiles('docs/agents/b.md', 'Lint with `scripts/lint.ts`.', isFile)).toEqual(['scripts/lint.ts']);
  });

  it('orders docs with as many changed files by name, and files of the same length by path', () => {
    const times = new Map([
      ['docs/b.md', day('2026-10-01')],
      ['docs/a.md', day('2026-10-01')],
      ['src/x.ts', day('2026-10-02')],
    ]);

    expect(docsToReverify([{ doc: 'docs/b.md', references: ['src/x.ts'] }, { doc: 'docs/a.md', references: ['src/x.ts'] }], times)).toEqual([
      { doc: 'docs/a.md', changed: ['src/x.ts'] },
      { doc: 'docs/b.md', changed: ['src/x.ts'] },
    ]);
    expect(filesNearLimit([{ path: 'src/b.ts', lines: 470 }, { path: 'src/a.ts', lines: 470 }], new Set())).toEqual([
      { path: 'src/a.ts', lines: 470 },
      { path: 'src/b.ts', lines: 470 },
    ]);
  });
});
