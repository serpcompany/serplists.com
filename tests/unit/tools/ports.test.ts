import { spawn, spawnSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readdirSync, readFileSync, realpathSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import {
  checkoutPorts,
  firstWorktreePort,
  lastSlot,
  launch,
  mainPorts,
  portsFor,
  portsPerWorktree,
  roles,
} from '../../../tools/checks/ports.mjs';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { packageScripts } from '../../support/packageScripts';

const repoRoot = process.cwd();
const script = path.join(repoRoot, 'tools', 'checks', 'ports.mjs');
const portsSchema = z.object({ dev: z.number(), e2e: z.number(), preview: z.number() }).strict();
const SLOW = 30_000;

const folders: string[] = [];
afterEach(() => {
  for (const folder of folders.splice(0)) rmSync(folder, { recursive: true, force: true });
});

function scratch(): string {
  const folder = realpathSync(mkdtempSync(path.join(tmpdir(), 'ports-')));
  folders.push(folder);
  return folder;
}

const environment = (changes: Record<string, string> = {}): NodeJS.ProcessEnv => ({
  ...throwawayRepositoryEnvironment(),
  PORT: undefined,
  ...changes,
});

const git = (folder: string, ...command: string[]) =>
  spawnSync('git', ['-c', 'user.name=Test', '-c', 'user.email=test@example.com', ...command], {
    cwd: folder,
    encoding: 'utf8',
    env: environment(),
  });

function repository(): string {
  const folder = scratch();
  git(folder, 'init', '--quiet');
  git(folder, 'commit', '--quiet', '--allow-empty', '--message', 'Start');
  return folder;
}

function worktree(main: string, name: string): string {
  const folder = path.join(main, '.claude', 'worktrees', name);
  expect(git(main, 'worktree', 'add', '--quiet', '--detach', folder).status).toBe(0);
  return folder;
}

function subfolder(checkout: string): string {
  const folder = path.join(checkout, 'src', 'app');
  mkdirSync(folder, { recursive: true });
  return folder;
}

const ports = (folder: string, command: string[], changes: Record<string, string> = {}) =>
  spawnSync(process.execPath, [script, ...command], { cwd: folder, encoding: 'utf8', env: environment(changes) });
const portsOf = (folder: string, changes: Record<string, string> = {}) =>
  portsSchema.parse(JSON.parse(ports(folder, ['--json'], changes).stdout));
const claimsFolder = (main: string) => path.join(main, '.git', 'serplists-ports');
const claims = (main: string) => readdirSync(claimsFolder(main)).sort();

function twoWorktreesWithTheirBlocks() {
  const main = repository();
  const one = worktree(main, 'one');
  const other = worktree(main, 'other');
  expect(portsOf(one)).toEqual(portsFor(1));
  expect(portsOf(other)).toEqual(portsFor(2));
  return { main, one, other };
}

const asking = (folder: string) =>
  new Promise<[string, string]>((done) => {
    let said = '';
    const child = spawn(process.execPath, [script, '--json'], { cwd: folder, env: environment() });
    child.stdout.on('data', (chunk: Buffer) => {
      said += chunk.toString();
    });
    child.on('exit', () => done([folder, said.trim()]));
  });

describe('the ports of a checkout', () => {
  it('are the documented ones in the main checkout, which claims nothing', () => {
    const main = repository();
    expect(portsOf(main)).toEqual({ dev: 3000, e2e: 4173, preview: 8787 });
    expect(portsOf(subfolder(main))).toEqual(mainPorts);
    expect(checkoutPorts(main)).toEqual(mainPorts);
    expect(() => claims(main)).toThrow();
  });

  it('are the documented ones outside every repository', () => {
    expect(portsOf(scratch())).toEqual(mainPorts);
  });

  it("are a worktree's own block, the same each time it asks, from any folder in it", () => {
    const { main, one } = twoWorktreesWithTheirBlocks();
    expect(portsOf(one)).toEqual(portsFor(1));
    expect(portsOf(subfolder(one))).toEqual(portsFor(1));
    expect(checkoutPorts(one)).toEqual(portsFor(1));
    expect(portsOf(main)).toEqual(mainPorts);
    expect(claims(main)).toEqual(['1', '2']);
  }, SLOW);

  it("are the worktree's own when git names another folder, as it does for a git hook", () => {
    const main = repository();
    const one = worktree(main, 'one');
    expect(portsOf(subfolder(one), { GIT_DIR: path.join(main, '.git', 'worktrees', 'one') })).toEqual(portsFor(1));
    expect(claims(main)).toEqual(['1']);
    expect(readFileSync(path.join(claimsFolder(main), '1'), 'utf8')).toBe(`${one}\n`);
  });

  it('never overlap, and stay below the ports an operating system hands out itself', () => {
    const used = new Set<number>(Object.values(mainPorts));
    for (let slot = 1; slot <= lastSlot; slot += 1) {
      for (const port of Object.values(portsFor(slot))) {
        expect(used.has(port), `${port} in block ${slot}`).toBe(false);
        used.add(port);
      }
    }
    expect(roles.length).toBeLessThanOrEqual(portsPerWorktree);
    expect(firstWorktreePort + portsPerWorktree * (lastSlot + 1)).toBeLessThan(32_768);
  });

  it('are printed as addresses, by role', () => {
    const one = worktree(repository(), 'one');
    expect(ports(one, []).stdout.split(/\r?\n/)).toEqual([
      'dev      http://localhost:21010',
      'e2e      http://localhost:21011',
      'preview  http://localhost:21012',
      '',
    ]);
  });

  it('are given up by delete, and the next worktree takes the block', () => {
    const { main, one, other } = twoWorktreesWithTheirBlocks();
    expect(ports(one, ['delete']).stdout).toContain('Gave up http://localhost:21010 and its block');
    expect(claims(main)).toEqual(['2']);
    expect(ports(one, ['delete']).stdout.trim()).toBe('Nothing to give up.');
    expect(portsOf(worktree(main, 'third'))).toEqual(portsFor(1));
    expect(portsOf(other)).toEqual(portsFor(2));
    expect(ports(main, ['delete']).stdout).toContain('This checkout uses the main ports');
  }, SLOW);

  it("prune gives up a block whose worktree's folder is gone, and no other", () => {
    const { main, one, other } = twoWorktreesWithTheirBlocks();
    rmSync(one, { recursive: true, force: true });
    expect(ports(other, ['prune']).stdout).toContain(one);
    expect(claims(main)).toEqual(['2']);
    expect(ports(main, ['prune']).stdout.trim()).toBe('Nothing to give up.');
  }, SLOW);

  it("a new worktree takes over a gone worktree's block without being asked to prune", () => {
    const main = repository();
    const one = worktree(main, 'one');
    portsOf(one);
    rmSync(one, { recursive: true, force: true });
    expect(portsOf(worktree(main, 'other'))).toEqual(portsFor(1));
  });

  it('a file in the folder that is no claim is left alone', () => {
    const main = repository();
    portsOf(worktree(main, 'one'));
    writeFileSync(path.join(claimsFolder(main), 'notes.txt'), 'kept');
    writeFileSync(path.join(claimsFolder(main), '0'), 'kept');
    expect(ports(main, ['prune']).stdout.trim()).toBe('Nothing to give up.');
    expect(claims(main)).toEqual(['0', '1', 'notes.txt']);
  });

  it('are one block when a worktree asks several times at once, and differ between worktrees', async () => {
    const main = repository();
    const trees = ['a', 'b', 'c', 'd'].map((name) => worktree(main, name));
    const answers = await Promise.all([...trees, ...trees, ...trees].map(asking));
    const byTree = new Map<string, Set<string>>();
    for (const [folder, said] of answers) byTree.set(folder, (byTree.get(folder) ?? new Set()).add(said));
    for (const said of byTree.values()) expect(said.size).toBe(1);
    expect(new Set([...byTree.values()].flatMap((said) => [...said])).size).toBe(trees.length);
    expect(claims(main)).toHaveLength(trees.length);
  }, SLOW);
});

describe('the lock a claim is made under', () => {
  const lockOf = (main: string) => path.join(claimsFolder(main), 'lock');

  it('makes a worktree wait while another run holds it', async () => {
    const main = repository();
    const one = worktree(main, 'one');
    mkdirSync(lockOf(main), { recursive: true });
    let released = false;
    const answer = asking(one).then(([, said]) => ({ said, afterRelease: released }));
    await new Promise((resolve) => setTimeout(resolve, 400));
    released = true;
    rmSync(lockOf(main), { recursive: true });
    expect(await answer).toEqual({ said: JSON.stringify(portsFor(1)), afterRelease: true });
    expect(claims(main)).toEqual(['1']);
  }, SLOW);

  it('is taken over when the run that held it is long gone', () => {
    const main = repository();
    const one = worktree(main, 'one');
    mkdirSync(lockOf(main), { recursive: true });
    const longAgo = new Date(Date.now() - 120_000);
    utimesSync(lockOf(main), longAgo, longAgo);
    expect(portsOf(one)).toEqual(portsFor(1));
    expect(claims(main)).toEqual(['1']);
  });

  it('is not needed by a worktree that already has its block', () => {
    const main = repository();
    const one = worktree(main, 'one');
    expect(portsOf(one)).toEqual(portsFor(1));
    mkdirSync(lockOf(main));
    expect(portsOf(one)).toEqual(portsFor(1));
  });

  it('a claim left half written by a run that died is cleared by the next claim', () => {
    const main = repository();
    const one = worktree(main, 'one');
    mkdirSync(claimsFolder(main), { recursive: true });
    writeFileSync(path.join(claimsFolder(main), '1'), '');
    expect(portsOf(one)).toEqual(portsFor(1));
    expect(claims(main)).toEqual(['1']);
  });
});

describe('a command run with a role', () => {
  const helper = (folder: string, name: string, source: string) => {
    writeFileSync(path.join(folder, name), source);
    return name;
  };
  const showPort = (folder: string) =>
    helper(folder, 'show-port.mjs', 'process.stdout.write(process.env.PORT + " " + process.argv.slice(2).join(" "));');

  it("gets the role's port, in PORT and wherever an argument asks for it", () => {
    const one = worktree(repository(), 'one');
    const shown = showPort(one);
    const result = ports(one, ['run', 'preview', '--', 'node', shown, '--port', '@port', '--var', 'FRONTEND_URL:http://localhost:@port']);
    expect(result.stdout).toBe('21012 --port 21012 --var FRONTEND_URL:http://localhost:21012');
    expect(result.status).toBe(0);
    expect(ports(one, ['run', 'dev', '--', 'node', shown]).stdout.trim()).toBe('21010');
  });

  it('keeps a PORT the shell set', () => {
    expect(launch(21010, ['next', 'dev', '--port', '@port'], { PORT: '4000' })).toEqual({
      program: 'next',
      arguments: ['dev', '--port', '4000'],
      env: { PORT: '4000' },
    });
    const one = worktree(repository(), 'one');
    expect(ports(one, ['run', 'dev', '--', 'node', showPort(one)], { PORT: '4000' }).stdout.trim()).toBe('4000');
  });

  it("ends with the command's own status, and fails when the command can't start", () => {
    const main = repository();
    expect(ports(main, ['run', 'dev', '--', 'node', helper(main, 'exit-7.mjs', 'process.exit(7);')]).status).toBe(7);
    const absent = ports(main, ['run', 'dev', '--', 'serplists-no-such-command']);
    expect(absent.status).not.toBe(0);
    expect(absent.stdout).toBe('');
  });

  it.each([
    ['an unknown role', ['run', 'mailbox', '--', 'node']],
    ['no command', ['run', 'dev', '--']],
    ['a command with nothing to set it apart', ['run', 'dev', 'node']],
    ['another flag', ['run', 'dev', '--env', '.env', '--', 'node']],
    ['an unknown command', ['show']],
    ['an argument too many', ['--json', 'dev']],
  ])('refuses %s, with how to call it', (_, command) => {
    const result = ports(repository(), command);
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Usage:');
    expect(result.stdout).toBe('');
  });
});

describe('the servers this checkout starts', () => {
  it.each([
    ['dev', 'node tools/checks/ports.mjs run dev -- next dev'],
    ['preview', 'node tools/checks/ports.mjs run preview -- opennextjs-cloudflare preview --port @port'],
  ])('pnpm run %s takes its port from the script', (name, command) => {
    expect(packageScripts[name]).toContain(command);
  });

  it('pnpm run ports is the script', () => {
    expect(packageScripts['ports']).toBe('node tools/checks/ports.mjs');
  });
});
