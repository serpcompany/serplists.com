import { existsSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { z } from 'zod';

export const SIGNAL_WHEN_ASKED = 'tests/support/signalWhenAsked.ts';

const REQUEST_FILE = 'SERPLISTS_SIGNAL_REQUEST_FILE';
const ASKED_EVERY_MS = 25;
const signalSchema = z.enum(['SIGINT', 'SIGTERM', 'SIGHUP']);

export const signalWhenAskedEnv = (requestFile: string): Record<string, string> => ({ [REQUEST_FILE]: requestFile });

export function askForASignal(requestFile: string, signal: z.infer<typeof signalSchema>): void {
  writeFileSync(`${requestFile}.part`, signal);
  renameSync(`${requestFile}.part`, requestFile);
}

const requestFile = process.env[REQUEST_FILE];

if (requestFile) {
  const watching = setInterval(() => {
    if (!existsSync(requestFile)) return;
    const signal = signalSchema.parse(readFileSync(requestFile, 'utf8'));
    rmSync(requestFile, { force: true });
    clearInterval(watching);
    process.emit(signal);
  }, ASKED_EVERY_MS);
  watching.unref();
}
