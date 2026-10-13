import { describe, expect, it } from 'vitest';

import { type MaintenanceFacts, PROBLEMS_SHOWN_PER_CHECK, renderReport } from '../../../scripts/lib/maintenance-report-render';

const facts: MaintenanceFacts = {
  date: '2026-10-12',
  checks: [
    { name: 'comments', problems: [] },
    { name: 'docs', problems: ['docs/agents/ci.md:16  links to gone.yml, which doesn’t exist'] },
  ],
  staleDocs: [{ doc: 'docs/agents/run-execution.md', changed: ['a', 'b', 'c', 'd', 'e', 'f', 'g'] }],
  quality: {
    stale: [{ area: 'Runs', graded: '2026-09-30', changed: [{ path: 'src/features/run-execution/', day: '2026-10-03' }] }],
    ungraded: [],
  },
  debt: {
    open: 27,
    bySize: { small: 2, medium: 15, large: 10 },
    firstSmall: { section: 'Checks', debt: '`docs/agents/testing.md` is over its budget.', issue: '#516' },
    unsized: [],
  },
  largeFiles: { source: 'scripts/checks/sizes.ts', entries: [{ name: 'src/views/Huge.tsx', size: 610 }] },
  longDocs: { source: 'scripts/checks/doc-budgets.ts', entries: [{ name: 'docs/agents/testing.md', size: 599 }] },
  duplicates: { source: 'scripts/checks/known-duplicates.ts', entries: [{ name: 'tests/a.ts and tests/b.ts', size: 2 }] },
  nearLimit: [{ path: 'functions/api/handlers/clipy.ts', lines: 471 }],
  unchecked: [
    { doc: 'docs/product/runs.md', lines: [12, 40] },
    { doc: 'docs/product/mcp.md', lines: [9] },
  ],
  reviewFindings: [
    {
      part: 'functions/api',
      findings: 4,
      pulls: 3,
      blocking: 2,
      examples: [{ title: 'The email is logged.', url: 'https://github.com/o/r/pull/7#r1' }],
    },
    {
      part: 'src/views',
      findings: 1,
      pulls: 1,
      blocking: 0,
      examples: [{ title: 'Name it for what it does.', url: 'https://github.com/o/r/pull/9#r2' }],
    },
  ],
};

describe('the maintenance report', () => {
  it("shows a failing check with what it printed, and the command that runs it", () => {
    const report = renderReport(facts);

    expect(report).toContain('`pnpm run verify docs` fails:\n\n````text\ndocs/agents/ci.md:16  links to gone.yml');
    expect(report).not.toContain('`pnpm run verify comments` fails');
  });

  it('caps a check that fails many times, so the issue stays under GitHub’s size limit', () => {
    const problems = Array.from({ length: 3000 }, (_, index) => `docs/a.md:${index}  ${'x'.repeat(400)}`);
    const report = renderReport({ ...facts, checks: [{ name: 'docs', problems }] });

    expect(report).toContain(`docs/a.md:${PROBLEMS_SHOWN_PER_CHECK - 1} `);
    expect(report).not.toContain(`docs/a.md:${PROBLEMS_SHOWN_PER_CHECK} `);
    expect(report).toContain(`${3000 - PROBLEMS_SHOWN_PER_CHECK} more lines: run \`pnpm run verify docs\` for all of them.`);
    expect(report.length).toBeLessThan(65_536);
  });

  it('says when every check passes and no doc needs re-verifying', () => {
    const report = renderReport({ ...facts, checks: [{ name: 'comments', problems: [] }], staleDocs: [] });

    expect(report).toContain('## Checks\n\nPassing: comments.');
    expect(report).toMatch(/Check that each doc still matches them\.\n\nNone\./);
  });

  it('lists the docs to re-verify, five files each', () => {
    expect(renderReport(facts)).toContain('- `docs/agents/run-execution.md`: `a`, `b`, `c`, `d`, `e`, +2 more');
  });

  it('lists each quality row to re-grade, with the code that changed and when', () => {
    const report = renderReport(facts);

    expect(report).toContain('Rows of `docs/quality.md` whose code changed after the day they were graded.');
    expect(report).toContain('- Runs (graded 2026-09-30): `src/features/run-execution/` changed 2026-10-03');
    const ungraded = renderReport({ ...facts, quality: { stale: [], ungraded: ['Delivery'] } });
    expect(ungraded).toContain('- Rows without a Graded date, which each need one: Delivery.');
    expect(ungraded).not.toContain('Runs (graded');
  });

  it('sizes the known debt across both debt files, and names the small item code gardening takes next', () => {
    const report = renderReport(facts);

    expect(report).toContain('- `docs/tech-debt.md` and `docs/harness-debt.md`: 27 open items (2 small, 15 medium, 10 large).');
    expect(report).toContain('- First small item: Checks: `docs/agents/testing.md` is over its budget. Issue: #516.');
    expect(report).not.toContain('Rows without a Size');
    const unsized = renderReport({
      ...facts,
      debt: { ...facts.debt, firstSmall: null, unsized: [{ section: 'Code', debt: 'No formatter.', issue: 'No issue yet' }] },
    });
    expect(unsized).toContain('- First small item: none.');
    expect(unsized).toContain('- Rows without a Size, which each need one: 1.\n  - Code: No formatter. Issue: No issue yet.');
  });

  it('counts each exception list, naming where each entry and its reason are kept', () => {
    const report = renderReport(facts);

    expect(report).toContain('- Files over the size limit, each with its reason in `scripts/checks/sizes.ts`: 1.\n  - `src/views/Huge.tsx`: 610 lines');
    expect(report).toContain(
      '- Docs over their size budget, each with its allowance in `scripts/checks/doc-budgets.ts`: 1. Split one by topic, then lower or remove its allowance.\n  - `docs/agents/testing.md`: 599 lines',
    );
    expect(report).toContain('- Repeated blocks allowed for now, each pair with its reason in `scripts/checks/known-duplicates.ts`: 2.\n  - tests/a.ts and tests/b.ts: 2');
  });

  it('lists the code files near the size limit', () => {
    const report = renderReport(facts);

    expect(report).toContain('1 code file has 450 lines or more. Every one stops at 500');
    expect(report).toContain('- `functions/api/handlers/clipy.ts`: 471 lines');
    expect(renderReport({ ...facts, nearLimit: [] })).toContain('0 code files have 450 lines or more');
  });

  it('lists the product behaviors that have no automated check yet, by doc and line', () => {
    const report = renderReport(facts);

    expect(report).toContain('3 behaviors in 2 docs.');
    expect(report).toContain('- `docs/product/runs.md`: lines 12, 40\n- `docs/product/mcp.md`: line 9');
    expect(renderReport({ ...facts, unchecked: [] })).toContain('None: every behavior in the product docs names its check.');
  });

  it("lists the review's findings by part, with the parts that repeat first", () => {
    const report = renderReport(facts);

    expect(report).toContain(
      'Repeated:\n\n- `functions/api`: 4 in 3 pull requests, 2 blocking. [The email is logged.](https://github.com/o/r/pull/7#r1)',
    );
    expect(report).toContain('Elsewhere:\n\n- `src/views`: 1 in 1 pull request, 0 blocking. [Name it for what it does.]');
    expect(report).toContain('- [ ] For a part listed as repeated under Review findings');
    const quiet = renderReport({ ...facts, reviewFindings: facts.reviewFindings?.slice(1) ?? [] });
    expect(quiet).toContain('Nothing repeated.\n\nElsewhere:');
    expect(renderReport({ ...facts, reviewFindings: [] })).toContain('None in the last four weeks.');
    expect(renderReport({ ...facts, reviewFindings: null })).toContain(
      "Not collected: only the `report` job of `Weekly maintenance` reads the pull requests' comments.",
    );
  });

  it('says how to work the issue, after the checklist', () => {
    expect(renderReport(facts)).toMatch(
      /a check\.\n\nWork this issue one item per small pull request, as `docs\/agents\/ci-agents\.md` says under Weekly maintenance\.\n$/,
    );
  });
});
