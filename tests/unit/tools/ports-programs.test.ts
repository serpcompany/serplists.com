import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { describe, expect, it } from 'vitest';

import { mainPorts, portsFor } from '../../../tools/checks/ports.mjs';
import { CHILD_ENDING_STAND_IN, childrenEndAsEnv } from '../../support/childEndingStandIn';
import { aGitStandIn } from '../../support/gitStandIn';
import { aPreloadedProgram, PORTS_SCRIPT, portsEnvironment, portsSchema, repository, scratch, worktree } from '../../support/portsCheckouts';
import { ranToTheEnd, runScriptProcess } from '../../support/scriptProcess';

const A_SPAWN_THAT_CANNOT_START = [
  "import childProcess from 'node:child_process';",
  "import { EventEmitter } from 'node:events';",
  "import { syncBuiltinESMExports } from 'node:module';",
  'childProcess.spawn = () => {',
  '  const child = new EventEmitter();',
  '  child.kill = () => true;',
  "  process.nextTick(() => child.emit('error', new Error('spawn node ENOENT')));",
  '  return child;',
  '};',
];

describe('the ports of a checkout whose git answers what an older or broken git does', () => {
  function aCheckoutWhoseGitAnswers(folders: readonly string[], worktreeListStatus: number, folder: string = scratch()) {
    const gitOnThePath = aGitStandIn(scratch(), folder, {
      'rev-parse': `process.stdout.write(${JSON.stringify(folders.map((each) => `${each}\n`).join(''))});\n`,
      worktree: `process.stderr.write('fatal: cannot list the worktrees');\nprocess.exitCode = ${worktreeListStatus};\n`,
    });
    return (command: string[]) => ranToTheEnd(process.execPath, [PORTS_SCRIPT, ...command], { cwd: folder, env: portsEnvironment(gitOnThePath) });
  }

  it('are the main ports, with no block to give up, when git names no git folder, as git before 2.25 did inside .git', async () => {
    const portsUnder = aCheckoutWhoseGitAnswers(['.'], 0, worktree(repository(), 'one'));

    const asked = await portsUnder(['--json']);
    const deleted = await portsUnder(['delete']);

    expect(portsSchema.parse(JSON.parse(asked.stdout))).toEqual(mainPorts);
    expect(deleted.stdout.trim()).toBe('This checkout uses the main ports. Only a worktree has a block to give up.');
  }, 30_000);

  it('keep every block while git cannot list the worktrees: a worktree takes the next free block, and prune gives up nothing', async () => {
    const outside = scratch();
    const common = path.join(outside, 'git');
    const claims = path.join(common, 'serplists-ports');
    mkdirSync(path.join(common, 'worktrees', 'one'), { recursive: true });
    mkdirSync(claims);
    writeFileSync(path.join(claims, '1'), `${path.join(outside, 'gone')}\n`);
    const portsUnder = aCheckoutWhoseGitAnswers(['.', path.join(common, 'worktrees', 'one'), common], 128);

    const asked = await portsUnder(['--json']);
    const pruned = await portsUnder(['prune']);

    expect(portsSchema.parse(JSON.parse(asked.stdout))).toEqual(portsFor(2));
    expect(pruned.stdout.trim()).toBe('Nothing to give up.');
    expect(readFileSync(path.join(claims, '1'), 'utf8')).toBe(`${path.join(outside, 'gone')}\n`);
  }, 30_000);
});

describe('ports.mjs alongside other programs', () => {
  it('can be imported by a program whose first argument names no file, and then runs no command of its own', async () => {
    const program = `const { portsFor } = await import(${JSON.stringify(pathToFileURL(PORTS_SCRIPT).href)}); process.stdout.write(JSON.stringify(portsFor(1)));`;

    const run = await ranToTheEnd(process.execPath, ['--input-type=module', '--eval', program, 'no-such-script.mjs'], { cwd: scratch(), env: portsEnvironment() });

    expect([run.status, run.stdout, run.stderr]).toEqual([0, JSON.stringify(portsFor(1)), '']);
  });

  it('fails, naming the program, when the command it launches cannot start', async () => {
    const main = repository();
    const run = await ranToTheEnd(
      process.execPath,
      ['--import', aPreloadedProgram(scratch(), A_SPAWN_THAT_CANNOT_START), PORTS_SCRIPT, 'run', 'dev', '--', 'node', 'a-program.mjs'],
      { cwd: main, env: portsEnvironment() },
    );

    expect(run.status).toBe(127);
    expect(run.stderr).toBe("node didn't start: spawn node ENOENT\n");
  }, 30_000);

  it('fails when the command it runs ends with neither an exit code nor a signal', async () => {
    const finishes = path.join(scratch(), 'finishes.mjs');
    writeFileSync(finishes, "process.stdout.write('finished');\n");

    const run = await runScriptProcess('tools/checks/ports.mjs', {
      args: ['run', 'dev', '--', 'node', finishes],
      cwd: repository(),
      env: portsEnvironment(childrenEndAsEnv({ code: null, signal: null })),
      preloads: [CHILD_ENDING_STAND_IN],
    });

    expect([run.status, run.stdout]).toEqual([1, 'finished']);
  }, 30_000);

  it('passes a stop signal on to the command it runs, and fails when the signal ends that command', async () => {
    const main = repository();
    const helpers = scratch();
    const stopsWhenItsParentHasGone = path.join(helpers, 'stops-when-its-parent-has-gone.mjs');
    writeFileSync(
      stopsWhenItsParentHasGone,
      [
        'const parent = process.ppid;',
        'setInterval(() => { try { process.kill(parent, 0); } catch { process.exit(0); } }, 50);',
        "setTimeout(() => { process.stdout.write('finished'); process.exit(0); }, 5_000);",
        '',
      ].join('\n'),
    );
    const stoppedOnceItStarts = path.join(helpers, 'stopped-once-it-starts.mjs');
    writeFileSync(stoppedOnceItStarts, "process.on('newListener', (event) => { if (event === 'SIGHUP') setImmediate(() => process.emit('SIGTERM')); });\n");

    const run = await ranToTheEnd(
      process.execPath,
      ['--import', pathToFileURL(stoppedOnceItStarts).href, PORTS_SCRIPT, 'run', 'dev', '--', 'node', stopsWhenItsParentHasGone],
      { cwd: main, env: portsEnvironment() },
    );

    expect([run.status, run.stdout]).toEqual([1, '']);
  }, 30_000);
});
