import type { PathLike } from 'node:fs';
import fsPromises from 'node:fs/promises';
import { syncBuiltinESMExports } from 'node:module';
import path from 'node:path';
import { z } from 'zod';

export const FILE_SYSTEM_THAT_THROWS = 'tests/support/fileSystemThatThrows.ts';

export const THROWN_BY_THE_FILE_SYSTEM = 'stand-in: the file system failed with something other than an Error';

const ASKED_FOR = 'SERPLISTS_FILE_SYSTEM_THROWS_FOR';

export const fileSystemThatThrowsEnv = (file: string): Record<string, string> => ({ [ASKED_FOR]: file });

const refused = z.string().safeParse(process.env[ASKED_FOR]);

if (refused.success) {
  const refusing =
    <Args extends unknown[], Result>(forReal: (target: PathLike, ...rest: Args) => Promise<Result>) =>
    (target: PathLike, ...rest: Args): Promise<Result> =>
      path.resolve(String(target)) === path.resolve(refused.data) ? Promise.reject<never>(THROWN_BY_THE_FILE_SYSTEM) : forReal(target, ...rest);
  Reflect.set(fsPromises, 'readFile', refusing(fsPromises.readFile));
  Reflect.set(fsPromises, 'stat', refusing(fsPromises.stat));
  syncBuiltinESMExports();
}
