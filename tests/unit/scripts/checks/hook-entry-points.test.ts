import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { root } from '../../../../scripts/checks/files';
import { commentRule, stopRule } from '../../../../scripts/checks/rules';
import { buildScriptInvocation } from '../../../../scripts/lib/run-tool';
import { toldFile } from '../../../../tools/checks/route.mjs';
import { aCopyOfTheCheckout, type CheckoutCopy } from '../../../support/checkoutCopy';

type EntryPoint = 'hook.ts' | 'stop-hook.ts' | 'cli.ts';

type EntryPointRun = { status: number | null; stdout: string; stderr: string };

async function ranEntryPoint(script: EntryPoint, input: object, { at = root, args = [] }: { at?: string; args?: string[] } = {}): Promise<EntryPointRun> {
  const { command, args: invocation } = buildScriptInvocation(path.join(at, 'scripts', 'checks', script), args);
  const child = spawn(command, invocation, { cwd: at, stdio: ['pipe', 'pipe', 'pipe'] });
  child.stdin.end(JSON.stringify(input));
  const [stdout, stderr, status] = await Promise.all([
    text(child.stdout),
    text(child.stderr),
    new Promise<number | null>((exited) => child.on('close', exited)),
  ]);
  return { status, stdout, stderr };
}

const runEntryPoint = async (script: EntryPoint, input: object) => {
  const { status, stderr } = await ranEntryPoint(script, input);
  return { status, stderr };
};

describe("this checkout's hook entry points", { timeout: 120_000 }, () => {
  it('passes an edit to a file the per-file checks find clean', async () => {
    await expect(runEntryPoint('hook.ts', { file: 'scripts/checks/rules.ts' })).resolves.toEqual({ status: 0, stderr: '' });
  });

  it('leaves alone an edit to a file outside the repository', async () => {
    await expect(runEntryPoint('hook.ts', { file: path.join(tmpdir(), 'outside.ts') })).resolves.toEqual({ status: 0, stderr: '' });
  });

  it('lets the turn end and forgets the last report when the changed files pass the per-file checks and the docs pass', async () => {
    const session = `hook-entry-point-${process.pid}-${Date.now()}`;
    const told = toldFile(root, session) ?? '';
    mkdirSync(path.dirname(told), { recursive: true });
    writeFileSync(told, 'the report from before the fix');

    try {
      await expect(runEntryPoint('stop-hook.ts', { changed: ['scripts/checks/rules.ts'], session })).resolves.toEqual({ status: 0, stderr: '' });
      expect(existsSync(told)).toBe(false);
    } finally {
      rmSync(told, { force: true });
    }
  });

  it('refuses input that is not what the hooks send', async () => {
    expect((await runEntryPoint('hook.ts', { path: 'scripts/checks/rules.ts' })).status).not.toBe(0);
    expect((await runEntryPoint('stop-hook.ts', { changed: 'scripts/checks/rules.ts' })).status).not.toBe(0);
  });
});

describe('the checks of a checkout holding a file with a comment', { timeout: 300_000 }, () => {
  const commented = 'tools/a-commented-setting.yml';
  const finding = `${commented}:1  name: serp # why (YAML)`;
  let copy: CheckoutCopy;

  beforeAll(() => {
    copy = aCopyOfTheCheckout({ asGitRepository: true });
    writeFileSync(path.join(copy.root, commented), 'name: serp # why\n');
  }, 300_000);

  afterAll(() => copy.remove());

  it('refuse the edit from the edit hook with exit 2, the status Claude Code shows the agent, reporting the comment and the rule', async () => {
    const run = await ranEntryPoint('hook.ts', { file: commented }, { at: copy.root });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain(finding);
    expect(run.stderr).toContain(commentRule);
  });

  it('keep the turn from ending from the stop hook with exit 2, reporting the comment and how to finish the turn', async () => {
    const run = await ranEntryPoint('stop-hook.ts', { changed: [commented] }, { at: copy.root });

    expect(run.status).toBe(2);
    expect(run.stderr).toContain(finding);
    expect(run.stderr).toContain(stopRule);
  });

  it('fail pnpm run verify, which runs every check over the whole checkout when none is named, printing what each found and how each went', async () => {
    const run = await ranEntryPoint('cli.ts', {}, { at: copy.root });

    expect(run.status).toBe(1);
    expect(run.stdout).toContain(`\ncomments\n${finding}\n`);
    expect(run.stdout).toContain(commentRule);
    expect(run.stdout).toMatch(
      /\ncomments failed, docs (?:passed|failed), sizes (?:passed|failed), secrets (?:passed|failed), duplicates (?:passed|failed), deadcode (?:passed|failed), dependencies (?:passed|failed), linters (?:passed|failed), generated (?:passed|failed) \(/,
    );
  }, 600_000);
});
