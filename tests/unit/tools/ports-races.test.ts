import { existsSync, mkdirSync, readFileSync, utimesSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { portsFor } from '../../../tools/checks/ports.mjs';
import { aPreloadedProgram, claims, claimsFolder, lockOf, PORTS_SCRIPT, portsEnvironment, portsSchema, repository, scratch, worktree } from '../../support/portsCheckouts';
import { ranToTheEnd } from '../../support/scriptProcess';

const SLOW = 30_000;

const FILE_SYSTEM_STAND_IN = [
  "import fs from 'node:fs';",
  "import path from 'node:path';",
  "import { syncBuiltinESMExports } from 'node:module';",
  'const failure = (code, message) => Object.assign(new Error(`${code}: ${message}`), { code });',
  "const named = (target, name) => path.basename(String(target)) === name;",
  'const pause = Atomics.wait;',
  'const pauseFor = (...args) => Reflect.apply(pause, Atomics, args);',
];

const preloaded = (behavior: readonly string[]) => aPreloadedProgram(scratch(), [...FILE_SYSTEM_STAND_IN, ...behavior]);

const portsWith = (folder: string, command: string[], behavior: readonly string[]) =>
  ranToTheEnd(process.execPath, ['--import', preloaded(behavior), PORTS_SCRIPT, ...command], { cwd: folder, env: portsEnvironment() });

async function portsWithStandIn(folder: string, behavior: readonly string[]) {
  const run = await portsWith(folder, ['--json'], behavior);
  expect(run.stderr).toBe('');
  return portsSchema.parse(JSON.parse(run.stdout));
}

function aWorktreeWithALock(lockAge: 'fresh' | 'abandoned' | 'stamped ahead') {
  const main = repository();
  const one = worktree(main, 'one');
  mkdirSync(lockOf(main), { recursive: true });
  const offset = { fresh: 0, abandoned: -120_000, 'stamped ahead': 3_600_000 }[lockAge];
  const stamp = new Date(Date.now() + offset);
  utimesSync(lockOf(main), stamp, stamp);
  return { main, one };
}

const NO_HARD_LINKS = ["fs.linkSync = (from, to) => { throw failure('EPERM', `operation not permitted, link '${from}' -> '${to}'`); };"];

describe('a claim on a file system without hard links', () => {
  it('is written in place instead, and the next worktree takes the next block', async () => {
    const main = repository();
    const one = worktree(main, 'one');
    const other = worktree(main, 'other');

    await expect(portsWithStandIn(one, NO_HARD_LINKS)).resolves.toEqual(portsFor(1));
    await expect(portsWithStandIn(other, NO_HARD_LINKS)).resolves.toEqual(portsFor(2));
    expect(claims(main)).toEqual(['1', '2']);
    expect(readFileSync(path.join(claimsFolder(main), '1'), 'utf8')).toBe(`${one}\n`);
  }, SLOW);

  it('fails, naming the error, when no new file can be written either, and leaves no draft behind', async () => {
    const main = repository();
    const one = worktree(main, 'one');
    const readOnly = [
      ...NO_HARD_LINKS,
      'const write = fs.writeFileSync;',
      "fs.writeFileSync = (file, data, options) => { if (options?.flag === 'wx') throw failure('EROFS', `read-only file system, open '${file}'`); return write(file, data, options); };",
    ];

    const run = await portsWith(one, ['--json'], readOnly);

    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`EROFS: read-only file system, open '${path.join(claimsFolder(main), '1')}'\n`);
    expect(claims(main)).toEqual([]);
  });
});

describe('the lock a claim is made under, when other runs race for it', () => {
  it('is taken once the run that held it lets go while this one is looking at it', async () => {
    const { main, one } = aWorktreeWithALock('fresh');
    const theOtherRunLetsGo = [
      'const look = fs.statSync;',
      'let letGo = false;',
      "fs.statSync = (target, options) => { if (!letGo && named(target, 'lock')) { letGo = true; fs.rmSync(target, { recursive: true }); } return look(target, options); };",
    ];

    await expect(portsWithStandIn(one, theOtherRunLetsGo)).resolves.toEqual(portsFor(1));
    expect(claims(main)).toEqual(['1']);
  });

  it('is put back, not removed, when another run took over the abandoned lock just before it was moved aside', async () => {
    const { main, one } = aWorktreeWithALock('abandoned');
    const log = path.join(scratch(), 'lock.log');
    const anotherRunTakesOver = [
      `const LOG = ${JSON.stringify(log)};`,
      'const rename = fs.renameSync;',
      'let held = null;',
      "const what = (target) => (named(target, 'lock') ? 'the lock' : 'aside');",
      'fs.renameSync = (from, to) => {',
      "  if (held === null && named(from, 'lock')) { held = String(from); fs.rmSync(from, { recursive: true }); fs.mkdirSync(from); fs.appendFileSync(LOG, 'another run took the lock\\n'); }",
      '  rename(from, to);',
      '  fs.appendFileSync(LOG, `moved ${what(from)} to ${what(to)}\\n`);',
      '};',
      "Atomics.wait = (...args) => { if (held && fs.existsSync(held)) { fs.rmSync(held, { recursive: true }); fs.appendFileSync(LOG, 'another run let go\\n'); } return pauseFor(...args); };",
    ];

    await expect(portsWithStandIn(one, anotherRunTakesOver)).resolves.toEqual(portsFor(1));
    expect(readFileSync(log, 'utf8').trim().split('\n')).toEqual([
      'another run took the lock',
      'moved the lock to aside',
      'moved aside to the lock',
      'another run let go',
    ]);
    expect(claims(main)).toEqual(['1']);
  });

  it('keeps one block when other runs of the same worktree claimed two while it waited', async () => {
    const { main, one } = aWorktreeWithALock('fresh');
    const twoClaimsWhileWaiting = [
      `const CLAIMS = ${JSON.stringify(claimsFolder(main))};`,
      'let claimed = false;',
      'Atomics.wait = (...args) => {',
      `  if (!claimed) { claimed = true; for (const slot of ['3', '5']) fs.writeFileSync(path.join(CLAIMS, slot), ${JSON.stringify(`${one}\n`)}); fs.rmSync(path.join(CLAIMS, 'lock'), { recursive: true }); }`,
      '  return pauseFor(...args);',
      '};',
    ];

    await expect(portsWithStandIn(one, twoClaimsWhileWaiting)).resolves.toEqual(portsFor(3));
    expect(claims(main)).toEqual(['3']);
  });

  it('fails after 30 seconds, naming the lock and leaving it, when a lock stamped by a clock ahead of this one is never let go', async () => {
    const { main, one } = aWorktreeWithALock('stamped ahead');
    const aClockThatMovesOnWhileItPauses = [
      'const now = Date.now;',
      'let ahead = 0;',
      'Date.now = () => now() + ahead;',
      'Atomics.wait = (...args) => { ahead += 31_000; return pauseFor(...args); };',
    ];

    const run = await portsWith(one, ['--json'], aClockThatMovesOnWhileItPauses);

    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`Another run has held ${lockOf(main)} for 30 seconds. Remove it.\n`);
    expect(existsSync(lockOf(main))).toBe(true);
  });

  it('fails, naming the error, when an abandoned lock cannot be moved aside, and leaves nothing beside it', async () => {
    const { main, one } = aWorktreeWithALock('abandoned');
    const heldOpenByAnotherProgram = [
      'const rename = fs.renameSync;',
      "fs.renameSync = (from, to) => { if (named(from, 'lock')) throw failure('EPERM', `operation not permitted, rename '${from}' -> '${to}'`); return rename(from, to); };",
    ];

    const run = await portsWith(one, ['--json'], heldOpenByAnotherProgram);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(`EPERM: operation not permitted, rename '${lockOf(main)}' -> '${lockOf(main)}.`);
    expect(claims(main)).toEqual(['lock']);
  });

  it('fails, naming the error, when the lock cannot be made at all', async () => {
    const main = repository();
    const one = worktree(main, 'one');
    const aFolderItCannotWrite = [
      'const make = fs.mkdirSync;',
      "fs.mkdirSync = (folder, options) => { if (options === undefined && named(folder, 'lock')) throw failure('EACCES', `permission denied, mkdir '${folder}'`); return make(folder, options); };",
    ];

    const run = await portsWith(one, ['--json'], aFolderItCannotWrite);

    expect(run.status).toBe(1);
    expect(run.stderr).toBe(`EACCES: permission denied, mkdir '${lockOf(main)}'\n`);
  });
});
