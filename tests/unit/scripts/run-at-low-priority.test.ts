import { spawnSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildScriptInvocation, REPO_ROOT } from '../../../scripts/lib/run-tool';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('run-at-low-priority-start-');

describe('run-at-low-priority', { timeout: 60_000 }, () => {
  it('prints how to call it and exits 2 when given no command', () => {
    const result = runRepositoryScript('scripts/run-at-low-priority.ts');

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node --import tsx scripts/run-at-low-priority.ts <command> [arguments]');
  });

  it('leaves a run that already has a lower priority at that priority, rather than raising it', () => {
    const printPriority = path.join(workDir, 'print-priority.cjs');
    writeFileSync(printPriority, "console.log(require('node:os').getPriority());\n");
    const wrapper = buildScriptInvocation(path.join(REPO_ROOT, 'scripts/run-at-low-priority.ts'), ['node', printPriority]);
    const startAtTheLowestPriority = path.join(workDir, 'start-at-the-lowest-priority.cjs');
    writeFileSync(
      startAtTheLowestPriority,
      [
        `require('node:os').setPriority(${constants.priority.PRIORITY_LOW});`,
        `const run = require('node:child_process').spawnSync(${JSON.stringify(wrapper.command)}, ${JSON.stringify(wrapper.args)}, { stdio: 'inherit' });`,
        'process.exit(run.status ?? 1);',
        '',
      ].join('\n'),
    );

    const result = spawnSync(process.execPath, [startAtTheLowestPriority], { encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(Number(result.stdout.trim())).toBe(constants.priority.PRIORITY_LOW);
  });
});
