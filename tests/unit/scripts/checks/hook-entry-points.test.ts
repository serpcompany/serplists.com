import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { root } from '../../../../scripts/checks/files';
import { buildScriptInvocation } from '../../../../scripts/lib/run-tool';

function runEntryPoint(script: 'hook.ts' | 'stop-hook.ts', input: object) {
  const { command, args } = buildScriptInvocation(path.join(root, 'scripts', 'checks', script));
  return spawnSync(command, args, { cwd: root, input: JSON.stringify(input), encoding: 'utf8' });
}

describe("this checkout's hook entry points", { timeout: 120_000 }, () => {
  it('passes an edit to a file the per-file checks find clean', () => {
    const result = runEntryPoint('hook.ts', { file: 'scripts/checks/rules.ts' });

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('leaves alone an edit to a file outside the repository', () => {
    const result = runEntryPoint('hook.ts', { file: path.join(tmpdir(), 'outside.ts') });

    expect({ status: result.status, stderr: result.stderr }).toEqual({ status: 0, stderr: '' });
  });

  it('refuses input that is not what the hooks send', () => {
    expect(runEntryPoint('hook.ts', { path: 'scripts/checks/rules.ts' }).status).not.toBe(0);
    expect(runEntryPoint('stop-hook.ts', { changed: 'scripts/checks/rules.ts' }).status).not.toBe(0);
  });
});
