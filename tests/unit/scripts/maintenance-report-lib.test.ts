import { describe, expect, it } from 'vitest';

import {
  docsToReverify,
  filesNearLimit,
  firstSentence,
  isGardenedDoc,
  lastChange,
  lastChangeTimes,
  markdownTables,
  namedFiles,
  scoresToRegrade,
  summarizeDebt,
  uncheckedBehaviors,
} from '../../../scripts/lib/maintenance-report-lib';

const day = (date: string) => Date.parse(`${date}T12:00:00Z`) / 1000;

describe('markdownTables', () => {
  it('reads each table under its heading, skipping the divider row', () => {
    const text = [
      '# Quality',
      '',
      '## Product areas',
      '',
      '| Area | Grade |',
      '| --- | --- |',
      '| Runs | B |',
      '',
      'Prose between tables.',
      '',
      '| Area | Grade |',
      '| :-- | --- |',
      '| Templates | C |',
    ].join('\n');

    expect(markdownTables(text)).toEqual([
      { heading: 'Product areas', header: ['Area', 'Grade'], rows: [['Runs', 'B']] },
      { heading: 'Product areas', header: ['Area', 'Grade'], rows: [['Templates', 'C']] },
    ]);
  });
});

describe('lastChangeTimes', () => {
  it("takes each file's newest commit from git log, which lists the newest first", () => {
    const log = [
      '',
      '300\n\ndocs/agents/run-execution.md\nfunctions/api/handlers/checklists.ts\n',
      '200\n\nsrc/views/ChecklistRun.tsx\n',
      '100\n\ndocs/agents/run-execution.md\nsrc/views/ChecklistRun.tsx\nsrc/lib/api.ts\n',
    ].join('\0');

    expect(Object.fromEntries(lastChangeTimes(log))).toEqual({
      'docs/agents/run-execution.md': 300,
      'functions/api/handlers/checklists.ts': 300,
      'src/views/ChecklistRun.tsx': 200,
      'src/lib/api.ts': 100,
    });
  });
});

describe('lastChange', () => {
  const times = new Map([
    ['functions/api/utils/logger.ts', day('2026-10-01')],
    ['functions/api/handlers/templates.ts', day('2026-10-03')],
    ['functions/api/handlers/billing.ts', day('2026-09-20')],
    ['functions/api/handlers-old/x.ts', day('2026-10-09')],
  ]);

  it("takes a file's own time, and a folder's newest file's", () => {
    expect(lastChange(times, 'functions/api/utils/logger.ts')).toBe(day('2026-10-01'));
    expect(lastChange(times, 'functions/api/handlers/')).toBe(day('2026-10-03'));
    expect(lastChange(times, 'functions/api/handlers')).toBe(day('2026-10-03'));
    expect(lastChange(times, 'functions/seo/')).toBeUndefined();
  });
});

describe('scoresToRegrade', () => {
  const quality = [
    '## Product areas',
    '',
    '| Area | Grade | Code | Graded |',
    '| --- | --- | --- | --- |',
    '| Runs | B | `functions/api/handlers/checklists.ts`, `src/features/run-execution/` | 2026-09-30 |',
    '| Billing | B | `functions/api/handlers/billing.ts` | 2026-10-03 |',
    '| Delivery | C | `.github/workflows/` | soon |',
    '',
    '| Grade | Means |',
    '| --- | --- |',
    '| A | Tests, CI and docs cover it |',
  ].join('\n');
  const times = new Map([
    ['functions/api/handlers/checklists.ts', day('2026-09-30')],
    ['src/features/run-execution/RunPage.tsx', day('2026-10-03')],
    ['functions/api/handlers/billing.ts', day('2026-10-03')],
    ['.github/workflows/ci.yml', day('2026-10-04')],
  ]);

  it('lists each row whose Code changed after the day it was graded, with only that code', () => {
    expect(scoresToRegrade(quality, times).stale).toEqual([
      { area: 'Runs', graded: '2026-09-30', changed: [{ path: 'src/features/run-execution/', day: '2026-10-03' }] },
    ]);
  });

  it('names the rows without a readable Graded date, and skips tables without both columns', () => {
    expect(scoresToRegrade(quality, times).ungraded).toEqual(['Delivery']);
  });
});

describe('summarizeDebt', () => {
  const debt = [
    '# Tech debt',
    '',
    '## Code',
    '',
    '| Debt | Why it matters | Issue | Size |',
    '| --- | --- | --- | --- |',
    '| Identifiers still say `team.id` for Organization. More detail. | Confusing. | #12 | large |',
    '| No formatter. | Noise. | No issue yet | huge |',
    '',
    '# Harness debt',
    '',
    '## Checks',
    '',
    '| Debt | Why it matters | Issue | Size |',
    '| --- | --- | --- | --- |',
    '| `docs/agents/testing.md` is over its budget. Split it. | Slow to read. | #40 | small |',
    '| The token has no named keeper. | Risk. | #41 | small |',
    '',
    '| Grade | Means |',
    '| --- | --- |',
    '| A | Fine |',
  ].join('\n');

  it('counts the open rows of both files by size, and names the first small one from the top', () => {
    expect(summarizeDebt(debt)).toEqual({
      open: 4,
      bySize: { small: 2, medium: 0, large: 1 },
      firstSmall: { section: 'Checks', debt: '`docs/agents/testing.md` is over its budget.', issue: '#40' },
      unsized: [{ section: 'Code', debt: 'No formatter.', issue: 'No issue yet' }],
    });
  });

  it('has no first small item when none is small', () => {
    expect(summarizeDebt(debt.replaceAll('| small |', '| medium |')).firstSmall).toBeNull();
  });
});

describe('firstSentence', () => {
  it('stops at the first full stop outside code', () => {
    expect(firstSentence('Runs read `run.ts`. More.')).toBe('Runs read `run.ts`.');
    expect(firstSentence('`a. b` is code. Then more.')).toBe('`a. b` is code.');
    expect(firstSentence('No full stop')).toBe('No full stop');
  });
});

describe('namedFiles', () => {
  const repository = new Set([
    'functions/api/utils/logger.ts',
    'scripts/lint.ts',
    'next.config.ts',
    'docs/agents/system-overview.md',
    'docs/agents/images/flow.svg',
    'src/lib/api.ts',
  ]);
  const isFile = (path: string) => repository.has(path);

  it('collects the files a doc names in code or links, from the root or beside the doc', () => {
    const doc = [
      'The API logs with `functions/api/utils/logger.ts` and lints with `scripts/lint.ts:12`.',
      'Redirects live in [the config](../../next.config.ts#L4), drawn in [a picture](images/flow.svg).',
      'The client is [here](/src/lib/api.ts).',
    ].join('\n');

    expect(namedFiles('docs/agents/frontend.md', doc, isFile)).toEqual([
      'docs/agents/images/flow.svg',
      'functions/api/utils/logger.ts',
      'next.config.ts',
      'scripts/lint.ts',
      'src/lib/api.ts',
    ]);
  });

  it('leaves out other docs, web addresses, anchors, missing files and fenced code', () => {
    const doc = [
      'See [the overview](system-overview.md), [the site](https://serplists.com/scripts/lint.ts) and [above](#setup).',
      '`scripts/gone.ts` was removed.',
      '```sh',
      'node --import tsx `scripts/lint.ts`',
      '```',
    ].join('\n');

    expect(namedFiles('docs/agents/frontend.md', doc, isFile)).toEqual([]);
  });
});

describe('isGardenedDoc', () => {
  it('leaves decisions, generated references and third-party docs alone', () => {
    expect(['AGENTS.md', 'docs/agents/ci.md', 'docs/product/runs.md', '.claude/skills/pr-review/SKILL.md'].every(isGardenedDoc)).toBe(true);
    expect(['docs/adr/0001-contexts.md', 'docs/api/db-schema.md', 'docs/references/next/caching.md', 'scripts/lint.ts'].some(isGardenedDoc)).toBe(false);
  });
});

describe('docsToReverify', () => {
  const times = new Map([
    ['docs/agents/run-execution.md', 150],
    ['docs/agents/ci.md', 400],
    ['docs/agents/billing.md', 500],
    ['functions/api/handlers/checklists.ts', 200],
    ['functions/api/handlers/billing.ts', 600],
    ['src/lib/api.ts', 100],
  ]);

  it('lists the files a doc names that changed after it did, the most changed first', () => {
    expect(
      docsToReverify(
        [
          { doc: 'docs/agents/ci.md', references: ['functions/api/handlers/checklists.ts'] },
          { doc: 'docs/agents/billing.md', references: ['functions/api/handlers/billing.ts'] },
          {
            doc: 'docs/agents/run-execution.md',
            references: ['functions/api/handlers/checklists.ts', 'functions/api/handlers/billing.ts', 'src/lib/api.ts'],
          },
        ],
        times,
      ),
    ).toEqual([
      { doc: 'docs/agents/run-execution.md', changed: ['functions/api/handlers/checklists.ts', 'functions/api/handlers/billing.ts'] },
      { doc: 'docs/agents/billing.md', changed: ['functions/api/handlers/billing.ts'] },
    ]);
  });

  it('skips a doc with no history yet', () => {
    expect(docsToReverify([{ doc: 'docs/agents/new.md', references: ['src/lib/api.ts'] }], times)).toEqual([]);
  });
});

describe('uncheckedBehaviors', () => {
  it('finds the check lines that say no automated check exists yet, by doc and line', () => {
    const runs = ['# Runs', '', 'A Run can be reopened.', '', '- No automated check yet.', '', '- Check: Runs spec, "reopens a run".', '- No automated check yet.'];

    expect(
      uncheckedBehaviors([
        { doc: 'docs/product/runs.md', text: runs.join('\n') },
        { doc: 'docs/product/templates.md', text: '# Templates\n\n- Check: Templates spec, "copies".\n' },
      ]),
    ).toEqual([{ doc: 'docs/product/runs.md', lines: [5, 8] }]);
  });
});

describe('filesNearLimit', () => {
  it('lists the code files within 50 lines of the limit, longest first, leaving out those allowed past it', () => {
    const files = [
      { path: 'src/views/TemplateDetail.tsx', lines: 474 },
      { path: 'functions/api/handlers/clipy.ts', lines: 498 },
      { path: 'src/lib/api.ts', lines: 449 },
      { path: 'cloudflare-env.d.ts', lines: 9000 },
      { path: 'src/views/Huge.tsx', lines: 480 },
    ];

    expect(filesNearLimit(files, new Set(['src/views/Huge.tsx']))).toEqual([
      { path: 'functions/api/handlers/clipy.ts', lines: 498 },
      { path: 'src/views/TemplateDetail.tsx', lines: 474 },
    ]);
  });
});
