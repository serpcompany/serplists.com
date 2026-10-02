import { spawn, spawnSync, type ChildProcess } from 'node:child_process';
import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
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
