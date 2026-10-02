import { spawnSync } from 'node:child_process';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { availableParallelism, constants, tmpdir } from 'node:os';
import path from 'node:path';
import { parse } from 'yaml';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import vitestConfig from '../../../vitest.config';
import { LOCAL_SHARE_OF_CPU_THREADS, testWorkerLimit } from '../../../scripts/lib/local-test-workers';
import { buildScriptInvocation, REPO_ROOT } from '../../../scripts/lib/run-tool';

const workDir = mkdtempSync(path.join(tmpdir(), 'run-at-low-priority-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

describe('test workers on a developer machine', () => {
  it(`uses one in ${LOCAL_SHARE_OF_CPU_THREADS} CPU threads, and at least one, so a local run leaves the machine usable`, () => {
    expect([32, 16, 6, 2].map((threads) => testWorkerLimit({}, threads))).toEqual([8, 4, 1, 1]);
  });

  it("leaves CI at Vitest's default, since its runners have few cores and nothing else to run", () => {
    expect(testWorkerLimit({ CI: 'true' }, 4)).toBeNull();
  });

  it('is the limit the Vitest config sets', () => {
    expect(vitestConfig.test?.maxWorkers).toBe(testWorkerLimit(process.env, availableParallelism()) ?? undefined);
  });
});

describe('the pre-push check', () => {
  it('runs pnpm run verify through the low-priority wrapper', () => {
    const hooks = z
      .object({ 'pre-push': z.object({ commands: z.record(z.object({ run: z.string() })) }) })
      .parse(parse(readFileSync(path.join(REPO_ROOT, 'lefthook.yml'), 'utf8')));

    expect(hooks['pre-push'].commands['verify']?.run).toBe('node --import tsx scripts/run-at-low-priority.ts pnpm run verify');
  });

  it('runs its command below normal priority, so other programs get the CPU first, and passes on the exit code', () => {
    const printPriority = path.join(workDir, 'print-priority.cjs');
    writeFileSync(printPriority, "console.log(require('node:os').getPriority());\nprocess.exit(3);\n");
    const { command, args } = buildScriptInvocation(path.join(REPO_ROOT, 'scripts/run-at-low-priority.ts'), ['node', printPriority]);

    const result = spawnSync(command, args, { encoding: 'utf8' });

    expect(result.status).toBe(3);
    expect(Number(result.stdout.trim())).toBeGreaterThanOrEqual(constants.priority.PRIORITY_BELOW_NORMAL);
  });
});
