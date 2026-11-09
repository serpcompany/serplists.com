import childProcess from 'node:child_process';
import { syncBuiltinESMExports } from 'node:module';
import { z } from 'zod';

export const CHILD_ENDING_STAND_IN = 'tests/support/childEndingStandIn.ts';

export const RAISED_ON_ITSELF = 'stand-in: the process raised this signal on itself:';

const ASKED_FOR = 'SERPLISTS_CHILDREN_END_AS';

const endingSchema = z.object({
  code: z.number().nullable().optional(),
  signal: z.string().nullable().optional(),
  afterMs: z.number().optional(),
});

export const childrenEndAsEnv = (ending: z.infer<typeof endingSchema>): Record<string, string> => ({ [ASKED_FOR]: JSON.stringify(ending) });

const asked = process.env[ASKED_FOR];

if (asked !== undefined) {
  const { code, signal, afterMs = 0 } = endingSchema.parse(JSON.parse(asked));
  const spawnForReal = childProcess.spawn;
  Reflect.set(childProcess, 'spawn', (...args: Parameters<typeof spawnForReal>) => {
    const child = spawnForReal(...args);
    const emitForReal = child.emit.bind(child);
    Reflect.set(child, 'emit', (event: string | symbol, ...rest: unknown[]) => {
      if (event !== 'exit') return emitForReal(event, ...rest);
      const [realCode, realSignal] = rest;
      setTimeout(() => emitForReal(event, code === undefined ? realCode : code, signal === undefined ? realSignal : signal), afterMs);
      return true;
    });
    return child;
  });
  const killForReal = process.kill.bind(process);
  Reflect.set(process, 'kill', (pid: number, raised?: string | number) => {
    if (pid !== process.pid) return killForReal(pid, raised);
    process.stderr.write(`${RAISED_ON_ITSELF} ${String(raised)}\n`);
    return true;
  });
  syncBuiltinESMExports();
}
