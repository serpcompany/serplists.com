import { spawn } from 'node:child_process';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';

import { buildScriptInvocation } from '../../scripts/lib/run-tool';
import { parseJsonText } from './storedJson';

export type IdleProcess = { pid: number; startedAt: number; stop: () => void };

const reportedSchema = z.object({ pid: z.number(), startedAt: z.number() });

export function startAnIdleProcessNamed(folder: string, fileName: string): Promise<IdleProcess> {
  const script = path.join(folder, fileName);
  writeFileSync(
    script,
    'process.stdout.write(JSON.stringify({ pid: process.pid, startedAt: Math.round(Date.now() - process.uptime() * 1000) }) + "\\n");\n' +
      'setInterval(() => {}, 1000);\n',
  );
  const { command, args } = buildScriptInvocation(script);
  const child = spawn(command, args, { stdio: ['ignore', 'pipe', 'ignore'] });
  return new Promise((resolve, reject) => {
    child.stdout.once('data', (chunk) => resolve({ ...parseJsonText(String(chunk), reportedSchema), stop: () => child.kill() }));
    child.once('error', reject);
  });
}

export function isRunning(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

async function waitUntil(condition: () => boolean): Promise<boolean> {
  for (let attempt = 0; attempt < 100; attempt += 1) {
    if (condition()) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return condition();
}

export const ended = (pid: number): Promise<boolean> => waitUntil(() => !isRunning(pid));
