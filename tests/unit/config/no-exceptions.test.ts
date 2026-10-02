import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { filesGitTracksOrWouldTrack, GENERATED_FILES } from '../../../scripts/check-no-comments-lib.mjs';
import { walkFiles } from '../../../scripts/lib/repo-files.mjs';
import { onlyElement } from '../../support/elements';
import { isError, rulesFor } from '../../support/eslintConfig';

const repoRoot = process.cwd();
const readText = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

const MAX_LINES = 500;
const USER_CONTENT_IMAGE = 'src/components/shared/UserContentImage.tsx';
const NEXT_ROUTE_MODULE_EXPORTS = [
  'metadata',
  'generateMetadata',
  'viewport',
  'generateViewport',
  'generateStaticParams',
  'dynamic',
  'dynamicParams',
  'revalidate',
  'fetchCache',
  'runtime',
  'preferredRegion',
  'maxDuration',
];
const fastRefreshOptions = z.tuple([
  z.unknown(),
  z.object({ allowConstantExport: z.boolean().optional(), allowExportNames: z.array(z.string()).optional() }).passthrough(),
]);
const UNUSED_VARS_OPTIONS = { argsIgnorePattern: '^_', ignoreRestSiblings: true };
const unusedVarsOptions = z.tuple([z.unknown(), z.record(z.unknown())]);
const sameNames = (left: string[], right: string[]) => [...left].sort().join() === [...right].sort().join();

const packageScripts = z
  .object({ scripts: z.object({ 'test:run': z.string(), 'test:local-d1': z.string() }).catchall(z.string()) })
  .parse(JSON.parse(readText('package.json'))).scripts;

const workflowFiles = readdirSync(path.join(repoRoot, '.github/workflows'))
  .filter((name) => /\.ya?ml$/.test(name))
  .map((name) => `.github/workflows/${name}`);

const commandSources = [
  ...Object.entries(packageScripts).map(([name, script]) => ({ where: `package.json "${name}"`, text: script })),
  ...['lefthook.yml', ...workflowFiles].map((file) => ({ where: file, text: readText(file) })),
  ...walkFiles(repoRoot, 'scripts', (file: string) => /\.(mjs|cjs|js|ts)$/.test(file)).map((file: string) => ({
    where: file,
    text: readText(file),
  })),
];

const commandsMatching = (pattern: RegExp) =>
  commandSources.filter(({ text }) => pattern.test(text)).map(({ where }) => where);

const AUTHORED_CODE = /\.(js|jsx|mjs|cjs|ts|tsx|mts|cts)$/;
const authoredCodeFiles = filesGitTracksOrWouldTrack().filter(
  (file: string) => AUTHORED_CODE.test(file) && !GENERATED_FILES.includes(file) && existsSync(path.join(repoRoot, file)),
);

const pathPattern = z.union([z.string(), z.array(z.string())]).optional();
const dependencyRules = z
  .object({
    forbidden: z.array(
      z.object({
        name: z.string(),
        severity: z.string(),
        from: z.object({ path: pathPattern }).passthrough(),
        to: z.object({ path: pathPattern, pathNot: pathPattern, reachable: z.boolean().optional() }).passthrough(),
      }),
    ),
  })
  .parse(createRequire(import.meta.url)(path.join(repoRoot, '.dependency-cruiser.cjs'))).forbidden;
const patternsOf = (pattern: string | string[] | undefined) => (pattern === undefined ? [] : [pattern].flat());
const REACHABILITY_LEAVES_OUT = ['\\.d\\.ts$', '\\.test\\.tsx?$', '^src/app/', '\\.json$'];

const testFileArguments = (script: string, flag?: string) =>
  [...script.matchAll(flag ? new RegExp(`${flag}\\s+(\\S+\\.test\\.\\w+)`, 'g') : /(?:^|\s)(tests\/\S+\.test\.\w+)/g)]
    .map(([, file]) => file)
    .sort();

const maxLinesOptions = z.tuple([
  z.unknown(),
  z.object({ max: z.number().optional(), skipBlankLines: z.boolean().optional(), skipComments: z.boolean().optional() }).passthrough(),
]);

describe('no exceptions to the repository checks', { timeout: 60_000 }, () => {
  it('holds every authored JavaScript and TypeScript file to the same 500-line limit', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const exempt: string[] = [];
    for (const file of authoredCodeFiles) {
      const rule = (await rulesFor(eslint, file))['max-lines'];
      const options = maxLinesOptions.safeParse(rule).data?.[1];
      const held =
        isError(rule) &&
        options?.max === MAX_LINES &&
        options.skipBlankLines !== true &&
        options.skipComments !== true;
      if (!held) exempt.push(`${file}: ${JSON.stringify(rule ?? 'not linted')}`);
    }

    expect(
      exempt,
      `These files are not held to ESLint max-lines ${MAX_LINES}. Remove the per-file cap, override or ignore from ` +
        'eslint.config.js and split the file into modules by responsibility instead.',
    ).toEqual([]);
  });

  it('has no ESLint suppressions file and runs ESLint without suppression flags', () => {
    expect(
      existsSync(path.join(repoRoot, 'eslint-suppressions.json')),
      'eslint-suppressions.json lets known ESLint errors stay. Delete it and fix the code ESLint reports.',
    ).toBe(false);
    expect(
      commandsMatching(/--(suppress-all|suppress-rule|suppressions-location|prune-suppressions|pass-on-unpruned-suppressions)\b/),
      'ESLint suppression flags let known errors pass. Remove the flag and fix the code ESLint reports.',
    ).toEqual([]);
  });

  it('has no dependency-cruiser baseline and keeps every dependency rule an error', () => {
    expect(
      existsSync(path.join(repoRoot, '.dependency-cruiser-known-violations.json')),
      '.dependency-cruiser-known-violations.json lets known violations pass. Delete it and fix the imports instead.',
    ).toBe(false);
    expect(
      commandsMatching(/--ignore-known\b|--output-type[= ]baseline\b|-T[= ]baseline\b/),
      'depcruise --ignore-known and baseline output let known violations pass. Remove them and fix the imports.',
    ).toEqual([]);
    expect(
      dependencyRules.filter((rule) => rule.severity !== 'error').map((rule) => `${rule.name}: ${rule.severity}`),
      'A dependency rule below "error" never fails deps:check. Make it an error and fix the imports it reports.',
    ).toEqual([]);
  });

  it('exempts no module from the reachability rules and carves no module out of a dependency rule', () => {
    const reachabilityRules = dependencyRules.filter((rule) => rule.to.reachable === false);
    expect(reachabilityRules.map((rule) => rule.name).sort()).toEqual(['api-code-is-reachable', 'app-code-is-reachable']);
    for (const rule of reachabilityRules) {
      expect(
        patternsOf(rule.to.pathNot).filter((pattern) => !REACHABILITY_LEAVES_OUT.includes(pattern)),
        `${rule.name} may leave out only declaration files, tests, the route files it starts from and JSON. Delete ` +
          'the dead module, import it where it is needed, or move code only a script uses to scripts/lib.',
      ).toEqual([]);
      expect(patternsOf(rule.from.path)).toEqual(['^src/app/', '^next\\.config\\.ts$']);
    }
    expect(
      dependencyRules.flatMap((rule) =>
        [...patternsOf(rule.from.path), ...patternsOf(rule.to.path)]
          .filter((pattern) => pattern.includes('(?!'))
          .map((pattern) => `${rule.name}: ${pattern}`),
      ),
      'A negative lookahead in a rule path exempts the modules it names. Move them where the rule allows them instead.',
    ).toEqual([]);
  });

  it('runs every test file the unit run excludes in the local D1 run, and nothing else there', () => {
    expect(
      testFileArguments(packageScripts['test:run'], '--exclude'),
      'A test file excluded from pnpm run test:run must run in pnpm run test:local-d1, or no suite runs it. ' +
        'Add it to test:local-d1, or stop excluding it.',
    ).toEqual(testFileArguments(packageScripts['test:local-d1']));
  });

  it('holds every TSX file in src/ to the fast-refresh rule as an error, allowing only the exports Next.js reads from a route module', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const relaxed: string[] = [];
    for (const file of authoredCodeFiles.filter((name: string) => /^src\/.*\.tsx$/.test(name))) {
      const setting = (await rulesFor(eslint, file))['react-refresh/only-export-components'];
      const options = fastRefreshOptions.safeParse(setting).data?.[1];
      if (!isError(setting) || options?.allowConstantExport === true || !sameNames(options?.allowExportNames ?? [], NEXT_ROUTE_MODULE_EXPORTS)) {
        relaxed.push(`${file}: ${JSON.stringify(setting ?? 'not linted')}`);
      }
    }

    expect(
      relaxed,
      'A module that exports a component and anything else is not a Fast Refresh boundary in Next.js, so editing it ' +
        'reloads its importers and drops their state. Move the other exports to a module of their own instead of ' +
        'relaxing react-refresh/only-export-components.',
    ).toEqual([]);
  });

  it('holds every TypeScript file to no-unused-vars, marking only an argument kept for its type with _', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const relaxed: string[] = [];
    for (const file of authoredCodeFiles.filter((name: string) => /\.(ts|tsx|mts|cts)$/.test(name))) {
      const setting = (await rulesFor(eslint, file))['@typescript-eslint/no-unused-vars'];
      const options = unusedVarsOptions.safeParse(setting).data?.[1];
      if (!isError(setting) || JSON.stringify(options) !== JSON.stringify(UNUSED_VARS_OPTIONS)) {
        relaxed.push(`${file}: ${JSON.stringify(setting ?? 'not linted')}`);
      }
    }

    expect(
      relaxed,
      `Unused variables, imports and caught errors fail the lint everywhere: keep no-unused-vars at ${JSON.stringify(UNUSED_VARS_OPTIONS)}. ` +
        'Delete what is unused, and write catch {} for an error the code does not read.',
    ).toEqual([]);
  });

  it('holds the UI primitives to the product vocabulary in their visible text', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const result = onlyElement(
      await eslint.lintText('export const Label = () => <span>Switch Workspace</span>;', { filePath: 'src/components/ui/sample.tsx' }),
    );

    expect(result.messages.map((message) => message.message)).toContainEqual(expect.stringContaining('PRODUCT_SENSE.md'));
  });

  it('lets only UserContentImage render <img> in src/, with no file exempt from the convention', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const refusesImg = async (filePath: string) => {
      const result = onlyElement(await eslint.lintText('<img alt="" src={src} />;', { filePath }));
      return result.messages.some(
        (message) => message.ruleId === 'serplists/restricted-code' && message.message.includes('<UserContentImage>'),
      );
    };
    const exempt: string[] = [];
    for (const file of authoredCodeFiles.filter((name: string) => /^src\/.*\.tsx$/.test(name) && name !== USER_CONTENT_IMAGE)) {
      if (!(await refusesImg(file))) exempt.push(file);
    }

    expect(
      exempt,
      `<img> belongs only in ${USER_CONTENT_IMAGE}. Render <UserContentImage> in these files, and remove any ` +
        'override or owner that lets them render <img>.',
    ).toEqual([]);
    expect(await refusesImg(USER_CONTENT_IMAGE)).toBe(false);
  });

  it('refuses skipped, todo, fixme and focused tests in Vitest and Playwright files', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const refusals = async (code: string, filePath: string) => {
      const result = onlyElement(await eslint.lintText(code, { filePath }));
      return result.messages.filter((message) => message.ruleId === 'no-restricted-syntax').length;
    };
    const samples: Array<[string, string]> = [
      ["describe.skip('a', () => {});", 'tests/unit/sample.test.ts'],
      ["const run = process.env.CI ? describe : describe.skip;", 'tests/integration/sample.test.ts'],
      ["it.todo('a');", 'src/lib/sample.test.ts'],
      ["it.skipIf(true)('a', () => {});", 'tests/unit/sample.test.tsx'],
      ["test.fixme('a', async () => {});", 'tests/e2e/sample.spec.ts'],
      ["test('a', async ({}, testInfo) => { testInfo.skip(); });", 'tests/e2e/sample.spec.ts'],
      ["it.only('a', () => {});", 'tests/unit/scripts/sample.test.mjs'],
    ];

    for (const [code, filePath] of samples) {
      expect(
        await refusals(code, filePath),
        `ESLint must refuse \`${code}\` in ${filePath}. Restore SKIPPED_TEST_RESTRICTIONS for TEST_FILES in eslint.config.js.`,
      ).toBe(1);
    }
    expect(await refusals("describe('a', () => { it.each([1])('b %s', () => {}); });", 'tests/unit/sample.test.ts')).toBe(0);
  });
});
