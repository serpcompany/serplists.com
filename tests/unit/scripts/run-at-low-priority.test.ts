import { writeFileSync } from 'node:fs';
import { constants } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { buildScriptInvocation, REPO_ROOT } from '../../../scripts/lib/run-tool';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { ranToTheEnd } from '../../support/scriptProcess';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('run-at-low-priority-start-');

describe('run-at-low-priority', { timeout: 60_000 }, () => {
  it('prints how to call it and exits 2 when given no command', async () => {
    const result = await runRepositoryScript('scripts/run-at-low-priority.ts');

    expect(result.status).toBe(2);
    expect(result.stderr.trim()).toBe('Usage: node --import tsx scripts/run-at-low-priority.ts <command> [arguments]');
  });

  it('fails with status 1 when the shell ends with no exit status, as a killed shell, or one that cannot start, does', async () => {
    const shellVariable = Object.keys(process.env).find((name) => name.toUpperCase() === 'COMSPEC') ?? 'ComSpec';

    const result = await runRepositoryScript('scripts/run-at-low-priority.ts', ['kill', '-9', '$$'], {
      env: { [shellVariable]: path.join(workDir, 'no-such-shell.exe') },
    });

    expect([result.status, result.output]).toEqual([1, '']);
  });

  it('leaves a run that already has a lower priority at that priority, rather than raising it', async () => {
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

    const result = await ranToTheEnd(process.execPath, [startAtTheLowestPriority], {});

    expect(result.status).toBe(0);
    expect(Number(result.stdout.trim())).toBe(constants.priority.PRIORITY_LOW);
  });
});
