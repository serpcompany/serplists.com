import fs, { type PathLike, type RmOptions } from 'node:fs';
import { syncBuiltinESMExports } from 'node:module';
import { z } from 'zod';

export const BUSY_LOCAL_D1_STATE = 'tests/support/busyLocalD1State.ts';

export const busyLocalD1StateEnv = (code: string, refusals: number): Record<string, string> => ({
  SERPLISTS_BUSY_LOCAL_D1_STATE_CODE: code,
  SERPLISTS_BUSY_LOCAL_D1_STATE_REFUSALS: String(refusals),
});

export const BUSY_LOCAL_D1_STATE_REFUSAL = 'stand-in: the local D1 state is held open';

const busy = z
  .object({ code: z.string().min(1), refusals: z.coerce.number().int().nonnegative() })
  .safeParse({
    code: process.env['SERPLISTS_BUSY_LOCAL_D1_STATE_CODE'],
    refusals: process.env['SERPLISTS_BUSY_LOCAL_D1_STATE_REFUSALS'],
  });

if (busy.success) {
  const { code, refusals } = busy.data;
  const removeForReal = fs.rmSync;
  let refused = 0;
  fs.rmSync = (target: PathLike, options?: RmOptions) => {
    if (String(target).endsWith('miniflare-D1DatabaseObject') && refused < refusals) {
      refused += 1;
      console.error(`${BUSY_LOCAL_D1_STATE_REFUSAL} (${code})`);
      throw Object.assign(new Error(`${code}: resource busy or locked, rm '${String(target)}'`), { code });
    }
    removeForReal(target, options);
  };
  syncBuiltinESMExports();
}
