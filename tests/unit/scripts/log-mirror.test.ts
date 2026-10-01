import { EventEmitter } from 'node:events';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { PassThrough } from 'node:stream';
import { afterAll, describe, expect, it } from 'vitest';
import { BROWSER_TEST_LOG_PATH, DEV_LOG_PATH, mirrorOutputToLog } from '../../../scripts/lib/log-mirror.mjs';

const workDir = mkdtempSync(path.join(tmpdir(), 'log-mirror-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const fakeServer = () => Object.assign(new EventEmitter(), { stdout: new PassThrough(), stderr: new PassThrough() });

const capture = () => {
  const stream = new PassThrough();
  let text = '';
  stream.on('data', (chunk: Buffer) => {
    text += chunk.toString();
  });
  return { stream, text: () => text };
};

const nextTick = () => new Promise((resolve) => setImmediate(resolve));

async function runServer(logPath: string, write: (server: ReturnType<typeof fakeServer>) => void) {
  const server = fakeServer();
  const stdout = capture();
  const stderr = capture();
  const logFile = mirrorOutputToLog(server, logPath, { stdout: stdout.stream, stderr: stderr.stream });
  write(server);
  await nextTick();
  server.emit('exit', 0);
  await new Promise((resolve) => logFile.on('finish', resolve));
  return { stdout: stdout.text(), stderr: stderr.text(), log: readFileSync(logPath, 'utf8') };
}

describe('mirrorOutputToLog', () => {
  it("passes the server's output through unchanged and logs it without color codes", async () => {
    const result = await runServer(path.join(workDir, 'nested', 'server.log'), (server) => {
      server.stdout.write('\u001b[32mready\u001b[39m\n');
      server.stderr.write('{"level":"error","message":"api_error"}\n');
    });

    expect(result.stdout).toBe('\u001b[32mready\u001b[39m\n');
    expect(result.stderr).toBe('{"level":"error","message":"api_error"}\n');
    expect(result.log).toBe('ready\n{"level":"error","message":"api_error"}\n');
  });

  it('starts each run with an empty log, so a query reads only the latest run', async () => {
    const logPath = path.join(workDir, 'restart.log');
    writeFileSync(logPath, 'output of the previous run\n');

    const result = await runServer(logPath, (server) => server.stdout.write('this run\n'));

    expect(result.log).toBe('this run\n');
  });

  it('writes the dev and browser-test server logs where pnpm run logs:query looks', () => {
    expect([DEV_LOG_PATH, BROWSER_TEST_LOG_PATH]).toEqual(['tmp/logs/dev-all.log', 'tmp/logs/e2e-server.log']);
  });
});
