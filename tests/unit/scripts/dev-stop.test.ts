import { existsSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { aKillThatFails } from '../../support/killThatFails';
import { ended, type IdleProcess, isRunning, startAnIdleProcessNamed } from '../../support/processesRunning';
import { runRepositoryScriptWhileServing } from '../../support/repositoryScriptRun';

const workDir = mkdtempSync(path.join(tmpdir(), 'dev-stop-'));
const children: IdleProcess[] = [];

afterAll(() => {
  for (const child of children) child.stop();
  rmSync(workDir, { recursive: true, force: true });
});

async function startIdleProcessReportingWhatTheLauncherRecords(fileName: string): Promise<IdleProcess> {
  const started = await startAnIdleProcessNamed(workDir, fileName);
  children.push(started);
  return started;
}

async function runDevStopInACheckoutHoldingOnly(session: Record<string, unknown>, envFor: (cwd: string) => Record<string, string> = () => ({})) {
  const cwd = mkdtempSync(path.join(workDir, 'checkout-'));
  const sessionPath = path.join(cwd, 'tmp', 'dev-session.json');
  mkdirSync(path.dirname(sessionPath));
  writeFileSync(sessionPath, JSON.stringify(session));
  const result = await runRepositoryScriptWhileServing('scripts/dev-stop.ts', [], { cwd, env: envFor(cwd) });
  return { ...result, sessionLeft: existsSync(sessionPath) };
}

describe('dev:stop', { timeout: 60_000 }, () => {
  it('leaves a process alone when the recorded pid now belongs to another program', async () => {
    const other = await startIdleProcessReportingWhatTheLauncherRecords('editor-helper.cjs');

    const result = await runDevStopInACheckoutHoldingOnly({ port: 3001, pid: other.pid, startedAt: other.startedAt });

    expect(result.status).toBe(0);
    expect(isRunning(other.pid)).toBe(true);
    expect(result.output).toContain(`Skipped pid ${other.pid}`);
    expect(result.sessionLeft).toBe(false);
  });

  it('leaves a process alone when the session has no start times', async () => {
    const other = await startIdleProcessReportingWhatTheLauncherRecords('browser-helper.cjs');

    const result = await runDevStopInACheckoutHoldingOnly({ port: 3001, pid: other.pid });

    expect(result.status).toBe(0);
    expect(isRunning(other.pid)).toBe(true);
    expect(result.sessionLeft).toBe(false);
  });

  it('stops the dev launcher the session recorded', async () => {
    const launcher = await startIdleProcessReportingWhatTheLauncherRecords('dev-auto.ts');

    const result = await runDevStopInACheckoutHoldingOnly({ port: 3001, pid: launcher.pid, startedAt: launcher.startedAt });

    expect(result.status).toBe(0);
    expect(result.output).toContain(`Stopped dev session (pid ${launcher.pid})`);
    expect(await ended(launcher.pid)).toBe(true);
    expect(result.sessionLeft).toBe(false);
  });
});

describe('dev:stop with nothing to stop', { timeout: 60_000 }, () => {
  it('says no dev session is running when the checkout records none', async () => {
    const result = await runRepositoryScriptWhileServing('scripts/dev-stop.ts', [], { cwd: mkdtempSync(path.join(workDir, 'checkout-')) });

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('No dev session is running.');
  });

  it('clears a session that recorded no process', async () => {
    const result = await runDevStopInACheckoutHoldingOnly({ port: 3001, pid: null, startedAt: null });

    expect(result.status).toBe(0);
    expect(result.output.trim()).toBe('Dev session was not running; cleared tmp/dev-session.json.');
    expect(result.sessionLeft).toBe(false);
  });
});

describe('dev:stop when the launcher cannot be stopped', { timeout: 300_000 }, () => {
  it('names the pid it could not stop, says how to free the ports by hand, clears the session, and fails', async () => {
    const launcher = await startIdleProcessReportingWhatTheLauncherRecords('dev-auto.ts');

    const result = await runDevStopInACheckoutHoldingOnly({ port: 3001, pid: launcher.pid, startedAt: launcher.startedAt }, (cwd) => aKillThatFails(cwd, launcher.pid));

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Could not stop pid ${launcher.pid}: `);
    expect(result.stdout).toBe(
      'If dev servers still hold their ports, stop them from their terminal or the task manager.\nDev session was not running; cleared tmp/dev-session.json.\n',
    );
    expect(result.sessionLeft).toBe(false);
  });
});
