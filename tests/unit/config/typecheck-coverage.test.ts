import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { filesGitTracksOrWouldTrack } from '../../../scripts/check-no-comments-lib.mjs';

const repoRoot = process.cwd();
const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts)$/;
const TSCONFIG_FILE = /(^|\/)tsconfig[^/]*\.json$/;

const repositoryFiles: string[] = filesGitTracksOrWouldTrack().filter((file: string) => existsSync(file));

const typecheckScript = z
  .object({ scripts: z.object({ typecheck: z.string() }) })
  .parse(JSON.parse(readFileSync(path.join(repoRoot, 'package.json'), 'utf8'))).scripts.typecheck;

const tsconfigsTypecheckRuns = typecheckScript
  .split('&&')
  .map((command) => command.trim().split(/\s+/))
  .filter(([tool]) => tool === 'tsc')
  .map((args) => {
    const projectFlag = args.findIndex((arg) => arg === '-p' || arg === '--project');
    return path.posix.normalize(projectFlag === -1 ? 'tsconfig.json' : args[projectFlag + 1]);
  });

const filesTheTsconfigIncludes = (tsconfig: string): string[] => {
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(repoRoot, tsconfig), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(`${tsconfig}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    },
  });
  if (!parsed) throw new Error(`TypeScript could not read ${tsconfig}`);
  return parsed.fileNames.map((file) => path.relative(repoRoot, file).split(path.sep).join('/'));
};

describe('pnpm run typecheck', () => {
  it('runs every tsconfig the repository holds', () => {
    expect(
      repositoryFiles.filter((file) => TSCONFIG_FILE.test(file) && !tsconfigsTypecheckRuns.includes(file)),
      'pnpm run typecheck never runs these tsconfigs, so no file only they include is type-checked. Add ' +
        '"tsc -p <tsconfig>" to the typecheck script in package.json, or delete the tsconfig.',
    ).toEqual([]);
  });

  it('type-checks every TypeScript file the repository holds', () => {
    const typeChecked = new Set(tsconfigsTypecheckRuns.flatMap(filesTheTsconfigIncludes));

    expect(
      repositoryFiles.filter((file) => TYPESCRIPT_FILE.test(file) && !typeChecked.has(file)),
      'No tsconfig that pnpm run typecheck runs includes these files, so their type errors go unseen. Add each to ' +
        'the "include" of the tsconfig for its folder: tsconfig.json for src/, tsconfig.node.json for scripts/ and ' +
        'the root config files, functions/tsconfig.json for functions/ and db/, tests/tsconfig.json for tests/. ' +
        'A .ts file next to a .tsx file of the same name keeps the .tsx one out of every include: rename one of them.',
    ).toEqual([]);
  });
});
