import { describe, expect, it } from 'vitest';

import { markdownTables, staleScoreRows, summarizeDebt } from '../../../scripts/lib/maintenance-report-lib';

const at = (day: string, time = '12:00:00') => Date.parse(`${day}T${time}Z`) / 1000;

const SCORES = `# Quality Score

| Domain | Code | Tests | Graded |
| --- | --- | --- | --- |
| Runs | \`functions/api/handlers/checklists.ts\`, \`src/views/ChecklistRun.tsx\` | B | 2026-10-01 |
| Billing | \`functions/api/handlers/billing.ts\` | B | 2026-10-01 |
| Unknown date | \`functions/api/handlers/teams.ts\` | B | soon |

| Area | Grade | Notes |
| --- | --- | --- |
| Observability | C | \`functions/api/utils/logger.ts\` changed recently |
`;

describe('markdownTables', () => {
  it('reads each table with its header and rows, skipping the separator line', () => {
    const [domains, areas] = markdownTables(SCORES);

    expect(domains?.header).toEqual(['Domain', 'Code', 'Tests', 'Graded']);
    expect(domains?.rows.map((row) => row[0])).toEqual(['Runs', 'Billing', 'Unknown date']);
    expect(areas?.header).toEqual(['Area', 'Grade', 'Notes']);
  });
});

describe('staleScoreRows', () => {
  const commits: Record<string, number> = {
    'functions/api/handlers/checklists.ts': at('2026-10-03'),
    'src/views/ChecklistRun.tsx': at('2026-10-01', '23:00:00'),
    'functions/api/handlers/billing.ts': at('2026-09-30'),
    'functions/api/handlers/teams.ts': at('2026-10-05'),
    'functions/api/utils/logger.ts': at('2026-10-05'),
  };
  const rows = () => staleScoreRows(SCORES, (ref) => commits[ref] ?? null, (ref) => ref in commits);

  it('lists a row whose code changed after the day it was graded, with only the files that changed since', () => {
    expect(rows()).toEqual([
      { name: 'Runs', graded: '2026-10-01', changed: [{ ref: 'functions/api/handlers/checklists.ts', time: at('2026-10-03') }] },
    ]);
  });

  it('skips rows graded the same day their code changed, rows without a readable date, and tables without Code and Graded columns', () => {
    const names = rows().map((row) => row.name);

    expect(names).not.toContain('Billing');
    expect(names).not.toContain('Unknown date');
    expect(names).not.toContain('Observability');
  });

  it('ignores a path that no longer exists', () => {
    expect(staleScoreRows(SCORES, () => at('2026-10-09'), () => false)).toEqual([]);
  });
});

describe('summarizeDebt', () => {
  const tracker = `# Tech Debt Tracker

| ID | Area | Debt | Size |
| --- | --- | --- | --- |
| TD-21 | Runs | x | medium |
| TD-15 | D1 | x | small |
| TD-45 | Site | x | small |
| TD-5 | Names | x | large |
| TD-30 | Docs | x | |
`;

  it('counts open rows by size, names the oldest small one, and lists rows without a size', () => {
    expect(summarizeDebt(tracker)).toEqual({
      open: 5,
      bySize: { small: 2, medium: 1, large: 1 },
      unsized: ['TD-30'],
      oldestSmall: 'TD-15',
    });
  });

  it('names no oldest small row when there is none', () => {
    expect(summarizeDebt('| ID | Size |\n| --- | --- |\n| TD-1 | large |\n').oldestSmall).toBeNull();
  });
});
