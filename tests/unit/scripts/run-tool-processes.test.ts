import { spawn, type ChildProcess } from 'node:child_process';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { text } from 'node:stream/consumers';
import { afterAll, describe, expect, it } from 'vitest';

import { buildToolInvocation, describeSpawnError, killPidTree, killProcessTree, spawnTool } from '../../../scripts/lib/run-tool';

const repositories = mkdtempSync(path.join(tmpdir(), 'run-tool-repositories-'));
afterAll(() => rmSync(repositories, { recursive: true, force: true }));

function repositoryWith(packages: Record<string, unknown>) {
  const root = mkdtempSync(path.join(repositories, 'repo-'));
  for (const [name, manifest] of Object.entries(packages)) {
    mkdirSync(path.join(root, 'node_modules', name), { recursive: true });
    writeFileSync(path.join(root, 'node_modules', name, 'package.json'), JSON.stringify(manifest));
  }
  return root;
}

const exitOf = (child: ChildProcess) =>
  new Promise<{ code: number | null; signal: NodeJS.Signals | null }>((resolve) => {
    child.on('exit', (code, signal) => resolve({ code, signal }));
  });

const aChildThatWaits = () => spawn(process.execPath, ['-e', 'setInterval(() => {}, 1000)'], { stdio: 'ignore' });

describe('finding a tool in node_modules', () => {
  it('asks for pnpm install when the package is not installed', () => {
    expect(() => buildToolInvocation('next', [], { repoRoot: repositoryWith({}) })).toThrow('next is not installed. Run "pnpm install" first.');
  });

  it('refuses a package that names no bin for the tool', () => {
    expect(() => buildToolInvocation('next', [], { repoRoot: repositoryWith({ next: { name: 'next' } }) })).toThrow('next has no "next" bin entry.');
  });

  it('runs the one bin a package names as a string', () => {
    const repoRoot = repositoryWith({ eslint: { bin: 'bin/eslint.js' } });

    expect(buildToolInvocation('eslint', ['--version'], { repoRoot, execPath: 'node' })).toEqual({
      command: 'node',
      args: [path.join(repoRoot, 'node_modules', 'eslint', 'bin', 'eslint.js'), '--version'],
      options: {},
    });
  });
});

describe('spawnTool', { timeout: 60_000 }, () => {
  it('starts a local tool as a child process with the options it is given', async () => {
    const child = spawnTool('next', ['--version'], { stdio: ['ignore', 'pipe', 'ignore'] });
    const [output, exit] = await Promise.all([child.stdout ? text(child.stdout) : '', exitOf(child)]);

    expect(output).toMatch(/Next\.js v\d+\.\d+/);
    expect(exit.code).toBe(0);
  });
});

describe('stopping a process outside Windows', () => {
  it('signals the process by its pid, which stops it before it ends on its own', async () => {
    const child = aChildThatWaits();
    const exited = exitOf(child);

    killPidTree(child.pid ?? 0, 'SIGTERM', { platform: 'linux' });

    expect((await exited).code).not.toBe(0);
  });

  it('signals a running child directly', async () => {
    const child = aChildThatWaits();
    const exited = exitOf(child);

    expect(killProcessTree(child, 'SIGTERM', { platform: 'linux' })).toBe(true);
    expect((await exited).code).not.toBe(0);
  });
});

describe('describeSpawnError', () => {
  it('points to run-tool and pnpm install when the command could not be found', async () => {
    const missingCommand = path.join(tmpdir(), 'serplists-command-that-does-not-exist');
    const child = spawn(missingCommand, [], { stdio: 'ignore' });
    const error = await new Promise<unknown>((resolve) => child.on('error', resolve));

    expect(describeSpawnError(error, 'the API server')).toBe(
      `Could not start the API server: spawn ${missingCommand} ENOENT. Launch tools through scripts/lib/run-tool.ts, and run "pnpm install" if node_modules is missing.`,
    );
  });

  it('passes any other error on as its message', () => {
    expect(describeSpawnError(Object.assign(new Error('port in use'), { code: 'EADDRINUSE' }), 'next')).toBe('port in use');
    expect(describeSpawnError('killed', 'next')).toBe('killed');
  });
});
