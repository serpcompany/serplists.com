import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { createServer, type Server } from 'node:net';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';
import { buildScriptInvocation } from '../../../scripts/lib/run-tool';
import { parseJsonText } from '../../support/storedJson';

const devStop = buildScriptInvocation(path.join(process.cwd(), 'scripts', 'dev-stop.ts'));
const workDir = mkdtempSync(path.join(tmpdir(), 'dev-stop-'));
const children: ChildProcess[] = [];

afterAll(() => {
  for (const child of children) child.kill();
  rmSync(workDir, { recursive: true, force: true });
});

function startIdleProcessReportingWhatTheLauncherRecords(fileName: string): Promise<{ pid: number; startedAt: number }> {
  const script = path.join(workDir, fileName);
  writeFileSync(
    script,
    'process.stdout.write(JSON.stringify({ pid: process.pid, startedAt: Math.round(Date.now() - process.uptime() * 1000) }) + "\\n");\n' +
      'setInterval(() => {}, 1000);\n',
  );
  const { command, args } = buildScriptInvocation(script);
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  children.push(child);
  return new Promise((resolve, reject) => {
    child.stdout?.once('data', (chunk) => resolve(parseJsonText(String(chunk), z.object({ pid: z.number(), startedAt: z.number() }))));
    child.once('error', reject);
  });
}

function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(condition: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

function runDevStopInACheckoutHoldingOnly(session: Record<string, unknown>) {
  const cwd = mkdtempSync(path.join(workDir, 'checkout-'));
  const sessionPath = path.join(cwd, 'tmp', 'dev-session.json');
  mkdirSync(path.dirname(sessionPath));
  writeFileSync(sessionPath, JSON.stringify(session));
  const result = spawnSync(devStop.command, devStop.args, { cwd, encoding: 'utf8' });
  return { status: result.status, output: `${result.stdout}${result.stderr}`, sessionLeft: existsSync(sessionPath) };
}

describe('dev:stop', { timeout: 60_000 }, () => {
  it('leaves a process alone when the recorded pid now belongs to another program', async () => {
    const other = await startIdleProcessReportingWhatTheLauncherRecords('editor-helper.cjs');

    const result = runDevStopInACheckoutHoldingOnly({ port: 3001, pid: other.pid, startedAt: other.startedAt });

    expect(result.status).toBe(0);
    expect(isRunning(other.pid)).toBe(true);
    expect(result.output).toContain(`Skipped pid ${other.pid}`);
    expect(result.sessionLeft).toBe(false);
  });

  it('leaves a process alone when the session has no start times', async () => {
    const other = await startIdleProcessReportingWhatTheLauncherRecords('browser-helper.cjs');

    const result = runDevStopInACheckoutHoldingOnly({ port: 3001, pid: other.pid });

    expect(result.status).toBe(0);
    expect(isRunning(other.pid)).toBe(true);
    expect(result.sessionLeft).toBe(false);
  });

  it('stops the dev launcher the session recorded', async () => {
    const launcher = await startIdleProcessReportingWhatTheLauncherRecords('dev-auto.ts');

    const result = runDevStopInACheckoutHoldingOnly({ port: 3001, pid: launcher.pid, startedAt: launcher.startedAt });

    expect(result.status).toBe(0);
    expect(result.output).toContain(`Stopped dev session (pid ${launcher.pid})`);
    expect(await waitUntil(() => !isRunning(launcher.pid))).toBe(true);
    expect(result.sessionLeft).toBe(false);
  });
});

describe('dev:stop with nothing to stop', { timeout: 60_000 }, () => {
  it('says no dev session is running when the checkout records none', () => {
    const result = spawnSync(devStop.command, devStop.args, { cwd: mkdtempSync(path.join(workDir, 'checkout-')), encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('No dev session is running.');
  });

  it('clears a session that recorded no process', () => {
    const result = runDevStopInACheckoutHoldingOnly({ port: 3001, pid: null, startedAt: null });

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe('Dev session was not running; cleared tmp/dev-session.json.');
    expect(result.sessionLeft).toBe(false);
  });
});

describe('dev:all', { timeout: 60_000 }, () => {
  const devAll = buildScriptInvocation(path.join(process.cwd(), 'scripts', 'dev-auto.ts'));

  it('points at the session already running instead of starting a second server', async () => {
    const launcher = await startIdleProcessReportingWhatTheLauncherRecords('dev-auto.ts');
    const cwd = mkdtempSync(path.join(workDir, 'checkout-'));
    mkdirSync(path.join(cwd, 'tmp'));
    writeFileSync(path.join(cwd, 'tmp', 'dev-session.json'), JSON.stringify({ port: 3017, pid: launcher.pid, startedAt: launcher.startedAt }));

    const result = spawnSync(devAll.command, devAll.args, { cwd, encoding: 'utf8' });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain(`dev:all is already running at http://localhost:3017 (pid ${launcher.pid}, recorded in tmp/dev-session.json).`);
    expect(isRunning(launcher.pid)).toBe(true);
  });

  const holdingTheDefaultPort = async <T>(run: () => T): Promise<T> => {
    const holder: Server = createServer();
    const held = await new Promise<boolean>((resolve) => {
      holder.once('error', () => resolve(false));
      holder.listen({ host: '127.0.0.1', port: 3000 }, () => resolve(true));
    });
    try {
      return run();
    } finally {
      if (held) await new Promise<void>((closed) => holder.close(() => closed()));
    }
  };

  it('moves off a busy port 3000, then fails with the reason, starting no server, when it cannot record its session', async () => {
    const cwd = mkdtempSync(path.join(workDir, 'checkout-'));
    writeFileSync(path.join(cwd, 'tmp'), 'a file where the tmp folder belongs');

    const result = await holdingTheDefaultPort(() => spawnSync(devAll.command, devAll.args, { cwd, encoding: 'utf8' }));

    expect(result.status).toBe(1);
    expect(result.stdout).toMatch(/dev:all: port 3000 is busy, using \d+\./);
    expect(result.stdout).toMatch(/App and API: http:\/\/localhost:\d+ \(API at http:\/\/localhost:\d+\/api\)/);
    expect(result.stderr).toMatch(/EEXIST|ENOTDIR/);
    expect(result.stdout).not.toContain('Logs:');
  });
});
