import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { filesGitTracksOrWouldTrack } from '../../../scripts/check-no-comments-lib.mjs';
import { elementAt } from '../../support/elements';

const repoRoot = process.cwd();
const TYPESCRIPT_FILE = /\.(ts|tsx|mts|cts)$/;
const TSCONFIG_FILE = /(^|\/)tsconfig[^/]*\.json$/;
const SETTINGS_STRICTER_THAN_STRICT: ReadonlyArray<keyof ts.CompilerOptions> = [
  'noImplicitOverride',
  'noFallthroughCasesInSwitch',
  'exactOptionalPropertyTypes',
  'noUncheckedIndexedAccess',
  'noPropertyAccessFromIndexSignature',
];

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
    return path.posix.normalize(projectFlag === -1 ? 'tsconfig.json' : elementAt(args, projectFlag + 1));
  });

const parsedTsconfig = (tsconfig: string): ts.ParsedCommandLine => {
  const parsed = ts.getParsedCommandLineOfConfigFile(path.join(repoRoot, tsconfig), {}, {
    ...ts.sys,
    onUnRecoverableConfigFileDiagnostic: (diagnostic) => {
      throw new Error(`${tsconfig}: ${ts.flattenDiagnosticMessageText(diagnostic.messageText, '\n')}`);
    },
  });
  if (!parsed) throw new Error(`TypeScript could not read ${tsconfig}`);
  return parsed;
};

const filesTheTsconfigIncludes = (tsconfig: string): string[] =>
  parsedTsconfig(tsconfig).fileNames.map((file) => path.relative(repoRoot, file).split(path.sep).join('/'));

describe('pnpm run typecheck', () => {
  it('runs every tsconfig the repository holds', () => {
    expect(
      repositoryFiles.filter((file) => TSCONFIG_FILE.test(file) && !tsconfigsTypecheckRuns.includes(file)),
      'pnpm run typecheck never runs these tsconfigs, so no file only they include is type-checked. Add ' +
        '"tsc -p <tsconfig>" to the typecheck script in package.json, or delete the tsconfig.',
    ).toEqual([]);
  });

  it("holds every tsconfig it runs, the tests' included, to the five settings stricter than strict", () => {
    expect(
      tsconfigsTypecheckRuns.flatMap((tsconfig) => {
        const { options } = parsedTsconfig(tsconfig);
        return SETTINGS_STRICTER_THAN_STRICT.filter((setting) => options[setting] !== true).map(
          (setting) => `${tsconfig}: ${setting}`,
        );
      }),
      'These tsconfigs turn off a setting every project keeps on. Set it back to true, or remove the override so the ' +
        'project inherits it, and fix the errors it reports: narrow the value, give it a default that is right for ' +
        'that case, or throw an error that names what is missing; type a value read by known keys with the shape it ' +
        'has and index only a real dictionary; never a ! or a cast (docs/RELIABILITY.md#quality-gates).',
    ).toEqual([]);
  });

  it('takes no JavaScript into a project untyped', () => {
    expect(
      tsconfigsTypecheckRuns.filter((tsconfig) => parsedTsconfig(tsconfig).options.allowJs === true),
      'These tsconfigs set allowJs, so a JavaScript module joins the program with the types TypeScript infers from ' +
        'its code. Set "allowJs": false (Next.js writes its suggested true only when the key is missing) and give the ' +
        'module a .d.mts beside it, or convert it to TypeScript.',
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
