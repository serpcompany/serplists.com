import { describe, expect, it } from 'vitest';

import { failureReport, runChecks, selectRun } from '../../../../scripts/checks/checks';
import { duplicateRule } from '../../../../scripts/checks/rules';
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
});
