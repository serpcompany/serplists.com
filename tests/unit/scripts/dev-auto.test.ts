import { chmodSync, copyFileSync, existsSync, readFileSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { DEV_FALLBACK_AUTH_SECRET } from '../../../scripts/dev-auto-lib';
import { parseDevBindings } from '../../../scripts/lib/dev-bindings';
import { CHILD_ENDING_STAND_IN, childrenEndAsEnv, RAISED_ON_ITSELF } from '../../support/childEndingStandIn';
import { aCopyOfTheCheckoutWithStandIns, startTheCopysScript } from '../../support/checkoutCopyWithStandIns';
import { aFolderIn } from '../../support/foldersOfFiles';
import { devSessionPath, NEXT_DEV_READY, NEXT_DEV_STAND_IN, theDevSessionIn, whatNextDevWasStartedWith } from '../../support/nextDevStandIn';
import { ended, type IdleProcess, isRunning, startAnIdleProcessNamed } from '../../support/processesRunning';
import { runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const copy = await aCopyOfTheCheckoutWithStandIns(NEXT_DEV_STAND_IN);
const workDir = aWorkDirRemovedAfterAll('dev-auto-');
const idle: IdleProcess[] = [];
const devAlls: ReturnType<typeof startTheCopysScript>[] = [];

afterAll(async () => {
  for (const each of devAlls) each.child.kill();
  for (const each of idle) each.stop();
  await copy.remove();
});

const devAllEnv = (vars: Record<string, string> = {}): Record<string, string | undefined> => ({
  FORCE_COLOR: undefined,
  BETTER_AUTH_SECRET: undefined,
  JWT_SECRET: undefined,
  CORS_ALLOWED_ORIGINS: undefined,
  ...vars,
});

const NODE_IS_MOVED_AWAY_BEFORE_THE_FIRST_SPAWN = [
  "import childProcess from 'node:child_process';",
  "import { renameSync } from 'node:fs';",
  "import { syncBuiltinESMExports } from 'node:module';",
  'const start = childProcess.spawn;',
  'let moved = false;',
  'childProcess.spawn = (...args) => {',
  '  if (!moved) {',
  '    moved = true;',
  '    renameSync(process.env.SERPLISTS_NODE_MOVED_FROM, process.env.SERPLISTS_NODE_MOVED_TO);',
  '  }',
  '  return start(...args);',
  '};',
  'syncBuiltinESMExports();',
  '',
].join('\n');

type StartOptions = { env?: Record<string, string | undefined>; execPath?: string; preloads?: readonly string[] };

const startDevAll = (cwd: string, { env = devAllEnv(), execPath, preloads = [] }: StartOptions = {}) => {
  const started = startTheCopysScript(copy, 'scripts/dev-auto.ts', { cwd, env, preloads, ...(execPath === undefined ? {} : { execPath }) });
  devAlls.push(started);
  return started;
};

describe('pnpm run dev:all with a stand-in next dev', { timeout: 300_000 }, () => {
  it("starts next dev on the port it records, with .dev.vars and the Worker vars for that port, and ends with next dev's exit code", async () => {
    const checkout = aFolderIn(workDir, { '.dev.vars': 'BETTER_AUTH_SECRET=a-secret-from-the-dev-vars-file\nFORCE_COLOR=0\n' });
    const devAll = startDevAll(checkout, { env: devAllEnv({ CORS_ALLOWED_ORIGINS: 'https://tools.example.test' }) });
    await devAll.printed(NEXT_DEV_READY);
    const session = theDevSessionIn(checkout);
    const nextDev = whatNextDevWasStartedWith(checkout);
    const origin = `http://localhost:${session.port}`;

    await fetch(`http://127.0.0.1:${session.port}/exit?code=3`);
    const run = await devAll.finished;

    expect(session.pid).toBe(devAll.child.pid);
    expect(nextDev).toMatchObject({ args: ['dev', '--port', String(session.port)], PORT: String(session.port), FORCE_COLOR: '0' });
    expect(parseDevBindings(nextDev.SERPLISTS_DEV_BINDINGS)).toEqual({
      FRONTEND_URL: origin,
      CORS_ALLOWED_ORIGINS: `https://tools.example.test,${origin}`,
      BETTER_AUTH_SECRET: 'a-secret-from-the-dev-vars-file',
    });
    expect(run.stdout).toContain(`App and API: ${origin} (API at ${origin}/api)`);
    expect(run.stdout).toContain('Logs: tmp/logs/dev-all.log (query them with pnpm run logs:query)');
    expect(run.stdout).toContain(`\u001b[32m✓\u001b[39m ${NEXT_DEV_READY}${session.port}`);
    expect(readFileSync(path.join(checkout, 'tmp', 'logs', 'dev-all.log'), 'utf8')).toContain(`✓ ${NEXT_DEV_READY}${session.port}\n`);
    expect(run.status).toBe(3);
    expect(existsSync(devSessionPath(checkout))).toBe(false);
  });

  const endedAs = async (ending: Parameters<typeof childrenEndAsEnv>[0]) => {
    const checkout = aFolderIn(workDir);
    const devAll = startDevAll(checkout, { env: devAllEnv(childrenEndAsEnv(ending)), preloads: [CHILD_ENDING_STAND_IN] });
    await devAll.printed(NEXT_DEV_READY);
    await fetch(`http://127.0.0.1:${theDevSessionIn(checkout).port}/exit?code=0`);
    return { run: await devAll.finished, sessionLeft: existsSync(devSessionPath(checkout)) };
  };

  it('clears its session and raises on itself the signal that ended next dev, rather than exiting with a code of its own', async () => {
    const { run, sessionLeft } = await endedAs({ code: null, signal: 'SIGTERM' });

    expect(run.stderr).toContain(`${RAISED_ON_ITSELF} SIGTERM\n`);
    expect(run.status).toBe(0);
    expect(sessionLeft).toBe(false);
  });

  it('clears its session and fails when next dev ends with neither an exit code nor a signal', async () => {
    const { run, sessionLeft } = await endedAs({ code: null, signal: null });

    expect(run.stderr).not.toContain(RAISED_ON_ITSELF);
    expect(run.status).toBe(1);
    expect(sessionLeft).toBe(false);
  });

  it('turns colour on for next dev unless something set FORCE_COLOR, and dev:stop stops it and the next dev it started', async () => {
    const checkout = aFolderIn(workDir);
    const devAll = startDevAll(checkout);
    await devAll.printed(NEXT_DEV_READY);
    const nextDev = whatNextDevWasStartedWith(checkout);

    const stop = await runRepositoryScriptWhileServing('scripts/dev-stop.ts', [], { cwd: checkout });
    await devAll.finished;

    expect(nextDev.FORCE_COLOR).toBe('1');
    expect(parseDevBindings(nextDev.SERPLISTS_DEV_BINDINGS)['BETTER_AUTH_SECRET']).toBe(DEV_FALLBACK_AUTH_SECRET);
    expect(stop.stdout.trim()).toBe(`Stopped dev session (pid ${devAll.child.pid}).`);
    expect(stop.status).toBe(0);
    expect(await ended(nextDev.pid)).toBe(true);
    expect(existsSync(devSessionPath(checkout))).toBe(false);
  });

  it('clears its session and says why when the Node.js it runs on is moved away before next dev starts', async () => {
    const checkout = aFolderIn(workDir);
    const node = path.join(aFolderIn(workDir), path.basename(process.execPath));
    copyFileSync(process.execPath, node);
    chmodSync(node, 0o755);
    const preload = path.join(aFolderIn(workDir), 'move-node-aside.mjs');
    writeFileSync(preload, NODE_IS_MOVED_AWAY_BEFORE_THE_FIRST_SPAWN);
    const devAll = startDevAll(checkout, {
      execPath: node,
      preloads: [preload],
      env: devAllEnv({ SERPLISTS_NODE_MOVED_FROM: node, SERPLISTS_NODE_MOVED_TO: `${node}.moved` }),
    });

    const run = await devAll.finished;

    expect(run.stderr).toContain(
      `Could not start Next.js: spawn ${node} ENOENT. Launch tools through scripts/lib/run-tool.ts, and run "pnpm install" if node_modules is missing.`,
    );
    expect(run.stdout).toMatch(/App and API: http:\/\/localhost:\d+ /);
    expect(run.status).toBe(1);
    expect(existsSync(devSessionPath(checkout))).toBe(false);
  });
});

describe('pnpm run dev:all before it starts next dev', { timeout: 300_000 }, () => {
  it('points at the session already running instead of starting a second server', async () => {
    const launcher = await startAnIdleProcessNamed(aFolderIn(workDir), 'dev-auto.ts');
    idle.push(launcher);
    const checkout = aFolderIn(workDir, { 'tmp/dev-session.json': JSON.stringify({ port: 3017, pid: launcher.pid, startedAt: launcher.startedAt }) });

    const result = await startDevAll(checkout).finished;

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`dev:all is already running at http://localhost:3017 (pid ${launcher.pid}, recorded in tmp/dev-session.json).`);
    expect(isRunning(launcher.pid)).toBe(true);
  });

  const holdingTheDefaultPort = async <T>(run: () => Promise<T>): Promise<T> => {
    const holder = createServer();
    const held = await new Promise<boolean>((resolve) => {
      holder.once('error', () => resolve(false));
      holder.listen({ host: '127.0.0.1', port: 3000 }, () => resolve(true));
    });
    try {
      return await run();
    } finally {
      if (held) await new Promise<void>((closed) => holder.close(() => closed()));
    }
  };

  it('moves off a busy port 3000, then fails with the reason, starting no server, when it cannot record its session', async () => {
    const checkout = aFolderIn(workDir);
    writeFileSync(path.join(checkout, 'tmp'), 'a file where the tmp folder belongs');

    const result = await holdingTheDefaultPort(() => startDevAll(checkout).finished);

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/dev:all: port 3000 is busy, using \d+\./);
    expect(result.stdout).toMatch(/App and API: http:\/\/localhost:\d+ \(API at http:\/\/localhost:\d+\/api\)/);
    expect(result.stderr).toMatch(/EEXIST|ENOTDIR/);
    expect(result.stdout).not.toContain('Logs:');
  });
});
