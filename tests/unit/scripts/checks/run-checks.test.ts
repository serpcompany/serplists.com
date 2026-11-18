import { describe, expect, it } from 'vitest';

import { failureReport, runChecks, selectRun } from '../../../../scripts/checks/checks';
import { deadCodeRule, duplicateRule, linterRule } from '../../../../scripts/checks/rules';
import { scratchRepository } from './scratch';

const repeatedBlock = Array.from({ length: 12 }, (_, index) => `  total += values[${index}] * weights[${index}] + offsets[${index}];`).join('\n');
const moduleWith = (name: string) => `export function ${name}(values: number[], weights: number[], offsets: number[]) {\n  let total = 0;\n${repeatedBlock}\n  return total;\n}\n`;

describe('running the repository checks on a checkout', { timeout: 120_000 }, () => {
  it('fails the duplicate check with the rule, and passes the checks the paths give nothing to look at', async () => {
    const at = scratchRepository('run-checks', {
      'package.json': JSON.stringify({ name: 'scratch', private: true, type: 'module' }),
      'scripts/first.ts': moduleWith('first'),
      'scripts/second.ts': moduleWith('second'),
    });

    const outcomes = await runChecks(['duplicates', 'dependencies', 'linters', 'spelling'], selectRun(['scripts'], at));

    expect(outcomes.map(({ name, passed }) => `${name} ${passed ? 'passed' : 'failed'}`)).toEqual([
      'duplicates failed',
      'dependencies passed',
      'linters passed',
    ]);
    const report = failureReport(outcomes);
    expect(report).toMatch(/^\nduplicates\nscripts\/first\.ts:1-\d+ /);
    expect(report).toContain('scripts/second.ts');
    expect(report.endsWith(duplicateRule)).toBe(true);
  });

  it('fails the dead code check with the rule, and runs no duplicate search on a checkout without code folders', async () => {
    const at = scratchRepository('run-checks', {
      'package.json': JSON.stringify({ name: 'scratch', private: true, type: 'module', main: 'index.ts' }),
      'index.ts': 'export const start = 1;\n',
      'orphan.ts': 'export const orphan = 2;\n',
    });

    const [deadcode, duplicates] = await runChecks(['deadcode', 'duplicates'], selectRun([], at));

    expect(deadcode?.passed).toBe(false);
    expect(deadcode?.report).toContain('orphan.ts');
    expect(deadcode?.report.at(-1)).toBe(deadCodeRule);
    expect(duplicates).toEqual({ name: 'duplicates', passed: true, report: [] });
  });

  it("fails a broken workflow naming the broken key where actionlint can run, and says it didn't run where it can't", async () => {
    const at = scratchRepository('run-checks', { '.github/workflows/broken.yml': 'on: push\njobs:\n  build:\n    runs-on: ubuntu-latest\n    stepz: []\n' });

    const [linters] = await runChecks(['linters'], selectRun([], at));
    const report = linters?.report ?? [];

    expect([
      { passed: false, namesTheBrokenKey: true, ranNowhere: false },
      { passed: !process.env['CI'], namesTheBrokenKey: false, ranNowhere: true },
    ]).toContainEqual({
      passed: linters?.passed,
      namesTheBrokenKey: report.some((line) => line.includes('"stepz"')),
      ranNowhere: report.some((line) => line.startsWith("actionlint didn't run")),
    });
    expect(report.at(-1)).toBe(linterRule);
  });
});
