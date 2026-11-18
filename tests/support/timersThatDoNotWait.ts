import { syncBuiltinESMExports } from 'node:module';
import timers from 'node:timers/promises';

export const TIMERS_THAT_DO_NOT_WAIT = 'tests/support/timersThatDoNotWait.ts';

const ASKED_FOR = 'SERPLISTS_TIMERS_DO_NOT_WAIT';

export const timersThatDoNotWaitEnv: Readonly<Record<string, string>> = { [ASKED_FOR]: '1' };

if (process.env[ASKED_FOR] === '1') {
  Reflect.set(timers, 'setTimeout', (_milliseconds?: number, value?: unknown) => Promise.resolve(value));
  syncBuiltinESMExports();
}
