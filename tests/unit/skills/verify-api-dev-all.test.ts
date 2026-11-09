import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { createServer } from 'node:net';
import path from 'node:path';
import { afterAll, beforeEach, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { stringMatching } from '../../support/asymmetricMatchers';
import { capturedGroup } from '../../support/elements';
import { listeningPort } from '../../support/listeningPort';
import { devSessionPath, NEXT_DEV_STAND_IN_MODE, NEXT_DEV_STAND_IN_UPSTREAM, nextDevRecordIn, whatNextDevWasStartedWith } from '../../support/nextDevStandIn';
import { ended, type IdleProcess, isRunning, startAnIdleProcessNamed } from '../../support/processesRunning';
import { parseJsonText } from '../../support/storedJson';
import { throwawayRepositoryEnvironment } from '../../support/throwawayGitRepository';
import { aPlanFile, proof, runTheScript, theCheckoutCopy, theProofFolderOf, withTheStandInApi } from '../../support/verifyApiRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const copy = theCheckoutCopy();
const workDir = aWorkDirRemovedAfterAll('verify-api-dev-all-');
const launchers: IdleProcess[] = [];
const logPath = path.join(copy.root, 'tmp', 'logs', 'dev-all.log');
const plan = aPlanFile('dev-all', { steps: [{ api: 'GET /api/templates' }] });

afterAll(() => {
  for (const launcher of launchers) launcher.stop();
});

beforeEach(() => {
  rmSync(devSessionPath(copy.root), { force: true });
  rmSync(logPath, { force: true });
  rmSync(nextDevRecordIn(copy.root), { force: true });
});

const runNamed = (name: string) => `dev-all-${name}-${process.pid}`;

const verifyWithoutABase = (name: string, options: Parameters<typeof runTheScript>[1] = {}) => runTheScript([runNamed(name), plan], options);

function recordTheSession(session: { port: number; pid: number; startedAt: number }): void {
  mkdirSync(path.dirname(devSessionPath(copy.root)), { recursive: true });
  writeFileSync(devSessionPath(copy.root), JSON.stringify(session));
}

async function aRunningLauncher(): Promise<IdleProcess> {
  const launcher = await startAnIdleProcessNamed(workDir, 'dev-auto.ts');
  launchers.push(launcher);
  return launcher;
}

const portNothingAnswers = () =>
  new Promise<number>((resolve) => {
    const server = createServer().listen({ host: '127.0.0.1', port: 0 }, () => {
      const port = listeningPort(server);
      server.close(() => resolve(port));
    });
  });

const answerSchema = z.object({ requestId: z.string() }).passthrough();
const stepRequestId = (folder: string) => parseJsonText(proof(folder, '01.json'), answerSchema).requestId;

const STARTED = /^server: http:\/\/localhost:(\d+), this checkout's dev:all, started by this run \(launcher pid (\d+)\); stopped at the end$/m;

describe('the verify-api script without --base', { timeout: 300_000 }, () => {
  it("reuses this checkout's running dev:all, keeps only this run's lines from its log, and leaves it running", async () => {
    const launcher = await aRunningLauncher();
    execFileSync('git', ['checkout', '-q', '--detach'], { cwd: copy.root, env: throwawayRepositoryEnvironment() });

    await withTheStandInApi(async (origin) => {
      const port = Number(new URL(origin).port);
      recordTheSession({ port, pid: launcher.pid, startedAt: launcher.startedAt });
      mkdirSync(path.dirname(logPath), { recursive: true });
      writeFileSync(logPath, '{"requestId":"request-6","message":"api_request"}\n{"requestId":"request-99"}\nready\n{"requestId":"request-6","message":"api_response"}\n');

      const run = await verifyWithoutABase('reused');
      const folder = theProofFolderOf(runNamed('reused'));

      expect(run.status).toBe(0);
      expect(stepRequestId(folder)).toBe('request-6');
      expect(proof(folder, 'doctor.txt').split('\n').slice(0, 2)).toEqual([
        `server: http://localhost:${port}, this checkout's dev:all, already running (launcher pid ${launcher.pid}); left running`,
        stringMatching(/^commit: [0-9a-f]+ on a detached HEAD, \d+ files changed since$/),
      ]);
      expect(proof(folder, 'server.log')).toBe('{"requestId":"request-6","message":"api_request"}\n{"requestId":"request-6","message":"api_response"}\n');
    });

    execFileSync('git', ['checkout', '-q', 'staging'], { cwd: copy.root, env: throwawayRepositoryEnvironment() });
    expect(isRunning(launcher.pid)).toBe(true);
    expect(existsSync(devSessionPath(copy.root))).toBe(true);
  });

  it('says the reused dev:all wrote no log when its log is gone', async () => {
    const launcher = await aRunningLauncher();

    await withTheStandInApi(async (origin) => {
      recordTheSession({ port: Number(new URL(origin).port), pid: launcher.pid, startedAt: launcher.startedAt });

      const run = await verifyWithoutABase('no-log');

      expect(run.status).toBe(0);
      expect(proof(theProofFolderOf(runNamed('no-log')), 'server.log')).toBe("No log: this run's server writes none to tmp/logs/dev-all.log.\n");
    });
  });

  it('starts a dev:all when none runs, runs the plan through it, keeps its log lines, and stops it and its next dev at the end', async () => {
    await withTheStandInApi(async (origin) => {
      const run = await verifyWithoutABase('started', { env: { [NEXT_DEV_STAND_IN_UPSTREAM]: origin } });
      const folder = theProofFolderOf(runNamed('started'));
      const started = STARTED.exec(proof(folder, 'doctor.txt'));
      const nextDev = whatNextDevWasStartedWith(copy.root);

      expect(run.status).toBe(0);
      expect(nextDev.PORT).toBe(capturedGroup(started, 1));
      expect(proof(folder, 'server.log')).toBe(`{"route":"GET /api/templates","status":200,"requestId":"${stepRequestId(folder)}"}\n`);
      expect(await ended(Number(capturedGroup(started, 2)))).toBe(true);
      expect(await ended(nextDev.pid)).toBe(true);
      expect(existsSync(devSessionPath(copy.root))).toBe(false);
    });
  });

  it('stops the dev:all it started even when its session file is cleared before the run ends', async () => {
    const clearTheSessionOnSignOut = (route: string) => {
      if (route === 'POST /api/auth/sign-out') rmSync(devSessionPath(copy.root), { force: true });
    };

    await withTheStandInApi(
      async (origin) => {
        const run = await verifyWithoutABase('cleared', { env: { [NEXT_DEV_STAND_IN_UPSTREAM]: origin } });
        const started = STARTED.exec(proof(theProofFolderOf(runNamed('cleared')), 'doctor.txt'));

        expect(run.status).toBe(0);
        expect(await ended(Number(capturedGroup(started, 2)))).toBe(true);
        expect(await ended(whatNextDevWasStartedWith(copy.root).pid)).toBe(true);
      },
      { onRequest: clearTheSessionOnSignOut },
    );
  });

  it('fails, pointing at the log, when the dev:all it starts exits before it answers, as one does that finds another running', async () => {
    const launcher = await aRunningLauncher();
    recordTheSession({ port: await portNothingAnswers(), pid: launcher.pid, startedAt: launcher.startedAt });

    const run = await verifyWithoutABase('exited');

    expect(run.status).toBe(1);
    expect(run.output).toContain('dev:all stopped (exit 0) before it answered. Read tmp/logs/dev-all.log.');
    expect(isRunning(launcher.pid)).toBe(true);
  });

  it("gives up on a dev:all whose next dev never answers /api/health, stops it, and points at the log", async () => {
    const fastClock = path.join(workDir, 'fast-clock.mjs');
    writeFileSync(fastClock, 'const realNow = Date.now.bind(Date);\nconst startedAt = realNow();\nDate.now = () => startedAt + (realNow() - startedAt) * 30;\n');

    const run = await verifyWithoutABase('never-answers', { env: { [NEXT_DEV_STAND_IN_MODE]: 'silent' }, preloads: [fastClock] });

    expect(run.status).toBe(1);
    expect(run.output).toContain("dev:all didn't answer /api/health within 180 seconds. Read tmp/logs/dev-all.log.");
    expect(await ended(whatNextDevWasStartedWith(copy.root).pid)).toBe(true);
    expect(existsSync(devSessionPath(copy.root))).toBe(false);
  });
});
