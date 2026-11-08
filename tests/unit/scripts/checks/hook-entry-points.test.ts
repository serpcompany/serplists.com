import { spawn } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { describe, expect, it } from 'vitest';

import { root } from '../../../../scripts/checks/files';
import { buildScriptInvocation } from '../../../../scripts/lib/run-tool';

async function runEntryPoint(script: 'hook.ts' | 'stop-hook.ts', input: object): Promise<{ status: number | null; stderr: string }> {
  const { command, args } = buildScriptInvocation(path.join(root, 'scripts', 'checks', script));
  const child = spawn(command, args, { cwd: root, stdio: ['pipe', 'ignore', 'pipe'] });
  child.stdin.end(JSON.stringify(input));
  const [stderr, status] = await Promise.all([
    text(child.stderr),
    new Promise<number | null>((exited) => child.on('close', exited)),
  ]);
  return { status, stderr };
}

describe("this checkout's hook entry points", { timeout: 120_000 }, () => {
  it('passes an edit to a file the per-file checks find clean', async () => {
    await expect(runEntryPoint('hook.ts', { file: 'scripts/checks/rules.ts' })).resolves.toEqual({ status: 0, stderr: '' });
  });

  it('leaves alone an edit to a file outside the repository', async () => {
    await expect(runEntryPoint('hook.ts', { file: path.join(tmpdir(), 'outside.ts') })).resolves.toEqual({ status: 0, stderr: '' });
  });

  it('lets the turn end when the changed files pass the per-file checks and the docs pass', async () => {
    await expect(runEntryPoint('stop-hook.ts', { changed: ['scripts/checks/rules.ts'] })).resolves.toEqual({ status: 0, stderr: '' });
  });

  it('refuses input that is not what the hooks send', async () => {
    expect((await runEntryPoint('hook.ts', { path: 'scripts/checks/rules.ts' })).status).not.toBe(0);
    expect((await runEntryPoint('stop-hook.ts', { changed: 'scripts/checks/rules.ts' })).status).not.toBe(0);
  });
});
