import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { root } from '../../../../scripts/checks/files';
import { editHookReport, onceUntilFixed, stopHookReport } from '../../../../scripts/checks/hooks';
import { commentRule, stopRule } from '../../../../scripts/checks/rules';
import { toldFile } from '../../../../tools/checks/route.mjs';
import { throwawayRepositoryEnvironment } from '../../../support/throwawayGitRepository';
import { git, scratchFolder, scratchRepository, writeFiles } from './scratch';

const ECHO_THE_CALL = [
  "import { readFileSync } from 'node:fs';",
  "process.stderr.write(`checked by its own checkout: ${readFileSync(0, 'utf8')}`);",
  'process.exit(2);',
  '',
].join('\n');

const A_LOADER_THAT_RUNS_TYPESCRIPT_FILES_AS_JAVASCRIPT = {
  'node_modules/tsx/package.json': '{ "name": "tsx", "type": "module", "exports": "./loader.mjs" }\n',
  'node_modules/tsx/loader.mjs': "import { register } from 'node:module';\nregister('./hooks.mjs', import.meta.url);\n",
  'node_modules/tsx/hooks.mjs': [
    "import { readFile } from 'node:fs/promises';",
    'export async function load(url, context, nextLoad) {',
    "  if (!url.endsWith('.ts')) return nextLoad(url, context);",
    "  return { format: 'module', source: await readFile(new URL(url), 'utf8'), shortCircuit: true };",
    '}',
    '',
  ].join('\n'),
};

function otherCheckout(script: 'hook.ts' | 'stop-hook.ts', installed: boolean): string {
  return scratchRepository('hooks', {
    '.gitignore': 'node_modules/\nignored.ts\ntmp/\n',
    [`scripts/checks/${script}`]: ECHO_THE_CALL,
    'probe.ts': 'export const probe = 1;\n',
    'ignored.ts': 'export const ignored = 1;\n',
    ...(installed ? A_LOADER_THAT_RUNS_TYPESCRIPT_FILES_AS_JAVASCRIPT : {}),
  });
}

function committed(checkout: string): string {
  git(checkout, 'add', '--all');
  git(checkout, 'commit', '--quiet', '--message', 'Start');
  return checkout;
}

const hook = (script: 'hook.mjs' | 'stop-hook.mjs', input: object, inGitHubActions = false) =>
  spawnSync(process.execPath, [path.join(root, 'tools', 'checks', script)], {
    input: JSON.stringify(input),
    encoding: 'utf8',
    env: throwawayRepositoryEnvironment({ CLAUDE_PROJECT_DIR: root, GITHUB_ACTIONS: inGitHubActions ? 'true' : '' }),
  });

const edit = (file: string, inGitHubActions = false) => hook('hook.mjs', { tool_input: { file_path: file } }, inGitHubActions);

describe('the edit hook', { timeout: 60_000 }, () => {
  it('runs the checks of the checkout that owns the file, not the one the session started in', () => {
    const checkout = otherCheckout('hook.ts', true);
    const result = edit(path.join(checkout, 'probe.ts'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('checked by its own checkout');
    expect(result.stderr).toContain(JSON.stringify(path.join(checkout, 'probe.ts')));
  });

  it("finds a relative file_path from the session's cwd, not from the folder the hook was started in", () => {
    const checkout = otherCheckout('hook.ts', true);
    const result = hook('hook.mjs', { cwd: checkout, tool_input: { file_path: 'probe.ts' } });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(JSON.stringify(path.join(checkout, 'probe.ts')));
  });

  it('asks for an install where the owning checkout has none, except in a GitHub Actions job', () => {
    const checkout = otherCheckout('hook.ts', false);
    const result = edit(path.join(checkout, 'probe.ts'));
    expect(result.status).toBe(2);
    expect(result.stderr).toContain(`The checks can't run in ${git(checkout, 'rev-parse', '--show-toplevel').stdout.trim()}`);
    expect(edit(path.join(checkout, 'probe.ts'), true).status).toBe(0);
  });

  it('leaves alone a file git ignores, a deleted file, a file outside every repository, and a repository without these checks', () => {
    const checkout = otherCheckout('hook.ts', true);
    const outside = scratchFolder('hooks');
    writeFiles(outside, { 'probe.ts': 'export const probe = 1;\n' });
    const elsewhere = scratchRepository('hooks', { 'probe.ts': 'export const probe = 1;\n' });
    for (const file of [path.join(checkout, 'ignored.ts'), path.join(checkout, 'deleted.ts'), path.join(outside, 'probe.ts'), path.join(elsewhere, 'probe.ts')]) {
      const result = edit(file);
      expect({ file, status: result.status, stderr: result.stderr }).toEqual({ file, status: 0, stderr: '' });
    }
  });
});

describe('the stop hook', { timeout: 60_000 }, () => {
  it('blocks a turn once, never twice in a row', () => {
    const result = hook('stop-hook.mjs', { stop_hook_active: true, cwd: committed(otherCheckout('stop-hook.ts', true)) });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('runs the checks of the checkout the session works in, on the files changed since the last commit and new ones', () => {
    const checkout = committed(otherCheckout('stop-hook.ts', true));
    writeFiles(checkout, { 'probe.ts': 'export const probe = 2;\n', 'new.ts': 'export const created = 1;\n' });
    const result = hook('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' });
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('checked by its own checkout: {"changed":["new.ts","probe.ts"],"session":"session-1"}');
  });

  it('passes a checkout without packages while nothing has changed', () => {
    const result = hook('stop-hook.mjs', { cwd: committed(otherCheckout('stop-hook.ts', false)), session_id: 'session-1' });
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('asks a session once for an install, where a change waits to be checked', () => {
    const checkout = committed(otherCheckout('stop-hook.ts', false));
    writeFiles(checkout, { 'probe.ts': 'export const probe = 2;\n' });
    const first = hook('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' });
    expect(first.status).toBe(2);
    expect(first.stderr).toContain("The checks can't run in");
    expect(hook('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' }).status).toBe(0);
    expect(hook('stop-hook.mjs', { cwd: checkout, session_id: 'session-2' }).status).toBe(2);
  });

  it('asks a session again for an install when a change comes back after a turn with nothing to check', () => {
    const checkout = committed(otherCheckout('stop-hook.ts', false));
    const stop = () => hook('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' }).status;
    writeFiles(checkout, { 'probe.ts': 'export const probe = 2;\n' });
    expect(stop()).toBe(2);
    writeFiles(checkout, { 'probe.ts': 'export const probe = 1;\n' });
    expect(stop()).toBe(0);
    writeFiles(checkout, { 'probe.ts': 'export const probe = 2;\n' });
    expect(stop()).toBe(2);
  });

  it.each([
    ['installed nothing', false],
    ['installed its packages', true],
  ])('leaves a GitHub Actions job that %s to its own checks', (_job, installed) => {
    const checkout = committed(otherCheckout('stop-hook.ts', installed));
    writeFiles(checkout, { 'probe.ts': 'export const probe = 2;\n' });
    const result = hook('stop-hook.mjs', { cwd: checkout, session_id: 'session-1' }, true);
    expect(result.status).toBe(0);
    expect(result.stderr).toBe('');
  });

  it('leaves a folder outside every repository alone', () => {
    expect(hook('stop-hook.mjs', { cwd: scratchFolder('hooks') }).status).toBe(0);
  });
});

describe('the checks the hooks run', { timeout: 60_000 }, () => {
  it('report a comment in the file the edit hook was given, with the rule', async () => {
    const checkout = scratchRepository('hooks', { 'src/probe.ts': 'export const probe = 1; // why\n', 'src/clean.ts': 'export const clean = 1;\n' });
    const report = await editHookReport(checkout, path.join(checkout, 'src', 'probe.ts'));
    expect(report).toContain('src/probe.ts:1  export const probe = 1; // why');
    expect(report).toContain(commentRule);
    expect(await editHookReport(checkout, path.join(checkout, 'src', 'clean.ts'))).toBe('');
    expect(await editHookReport(checkout, path.join(scratchFolder('hooks'), 'probe.ts'))).toBe('');
  });

  it('report a broken doc link before the turn ends, with the stop rule, once per session', async () => {
    const checkout = scratchRepository('hooks', { 'AGENTS.md': '# AGENTS\n\n- [Code](docs/agents/code.md)\n', 'package.json': '{}\n' });
    const report = await stopHookReport(checkout, ['AGENTS.md'], 'session-1');
    expect(report).toContain("AGENTS.md:3  links to docs/agents/code.md, which doesn't exist in the repository");
    expect(report.endsWith(stopRule)).toBe(true);
    expect(await stopHookReport(checkout, ['AGENTS.md'], 'session-1')).toBe('');
    expect(await stopHookReport(checkout, ['AGENTS.md'], 'session-2')).toBe(report);
  });

  it('tell a session about a failure once until a turn ends clean, and again if it comes back', () => {
    const told = toldFile(scratchFolder('hooks'), 'session-1');
    const failure = 'docs/agents/ci.md:3  links to gone.md';
    const report = onceUntilFixed(failure, told);
    expect(report).toBe(`${failure}\n\n${stopRule}`);
    expect(onceUntilFixed(failure, told)).toBe('');
    expect(onceUntilFixed('', told)).toBe('');
    expect(onceUntilFixed(failure, told)).toBe(report);
  });
});
