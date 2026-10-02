import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';
import { isError, rulesFor } from '../../support/eslintConfig';
import { TYPE_CHECKED_AREAS } from '../../../eslint.type-aware.config';
import { lintRuns, TYPE_AWARE_CONFIG } from '../../../scripts/lib/lint-runs';

const UNSAFE_ANY_RULES = [
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-return',
];
const CAST_RULE = 'serplists/no-external-data-casts';
const ASSERTION_RULE = '@typescript-eslint/no-unsafe-type-assertion';
const RULES_TESTS_ONCE_TURNED_OFF = ['@typescript-eslint/no-explicit-any', '@typescript-eslint/no-this-alias'];

const TYPE_CHECKED_FILES = [
  'src/lib/api/request.ts',
  'src/components/shared/ContentRenderer.tsx',
  'functions/api/handlers/stripe.ts',
  'scripts/generate-db-schema-doc.ts',
  'scripts/lib/run-tool.ts',
  'db/schema/templates.ts',
];

const TYPE_CHECKED_TEST_FILES = [
  'tests/unit/functions/api/uploads-handler.test.ts',
  'tests/unit/views/TemplateEditor.test.tsx',
  'tests/integration/api.workerless.test.ts',
  'tests/e2e/run-share.spec.ts',
  'tests/e2e/support/api-requests.ts',
  'tests/support/readJson.ts',
  'tests/support/renderInTheDom.ts',
  'tests/setup.ts',
];

const CO_LOCATED_TEST_FILE = 'src/lib/routes.test.ts';

const JAVASCRIPT_TEST_FILE = 'tests/unit/functions/api/r2-file-response-from-workerd.test.mjs';

const lintScript = z
  .object({ scripts: z.object({ lint: z.string() }) })
  .parse(JSON.parse(readFileSync('package.json', 'utf8'))).scripts.lint;

describe('external data is parsed at the boundary, not cast', { timeout: 60_000 }, () => {
  const typeAware = new ESLint({ cwd: process.cwd(), overrideConfigFile: TYPE_AWARE_CONFIG });
  const everyCommit = new ESLint({ cwd: process.cwd() });

  it('runs pnpm run lint with the type-aware config, so verify and CI refuse unsafe any', () => {
    expect(lintScript).toBe('node --import tsx scripts/lint.ts');
    expect(lintRuns().every((args) => args.slice(0, 2).join(' ') === `--config ${TYPE_AWARE_CONFIG}`)).toBe(true);
  });

  it('lints each type-checked area in its own process, and every other file once more without them', () => {
    const areaFolders = TYPE_CHECKED_AREAS.flatMap(({ folders }) => folders);
    const runs = lintRuns().map((args) => args.slice(2));
    const everythingElse = runs.at(-1);

    expect(runs.slice(0, -1)).toEqual(TYPE_CHECKED_AREAS.map(({ folders }) => folders));
    expect(everythingElse).toEqual(['.', ...areaFolders.flatMap((folder) => ['--ignore-pattern', `${folder}/**`])]);
  });

  it('gives each area the one TypeScript project that types it, so no process loads a project it does not lint', () => {
    expect(TYPE_CHECKED_AREAS.map(({ folders, project }) => [folders.join(' '), project])).toEqual([
      ['src', './tsconfig.json'],
      ['functions db', './functions/tsconfig.json'],
      ['scripts', './tsconfig.node.json'],
      ['tests', './tests/tsconfig.json'],
    ]);
    expect(TYPE_CHECKED_AREAS.every(({ folders, files }) => files.every((glob) => folders.some((folder) => glob.startsWith(`${folder}/`))))).toBe(true);
  });

  const rulesTurnedOff = async (file: string, names: readonly string[]) => {
    const rules = await rulesFor(typeAware, file);
    return names.filter((rule) => !isError(rules[rule]));
  };

  it.each([...TYPE_CHECKED_FILES, ...TYPE_CHECKED_TEST_FILES, CO_LOCATED_TEST_FILE])(
    'refuses unsafe any, external data casts and narrowing type assertions in %s',
    async (file) => {
      expect(await rulesTurnedOff(file, [...UNSAFE_ANY_RULES, CAST_RULE, ASSERTION_RULE])).toEqual([]);
    },
  );

  it.each([...TYPE_CHECKED_FILES, ...TYPE_CHECKED_TEST_FILES, CO_LOCATED_TEST_FILE, JAVASCRIPT_TEST_FILE])(
    'refuses external data casts in %s on every commit',
    async (file) => {
      expect(isError((await rulesFor(everyCommit, file))[CAST_RULE])).toBe(true);
    },
  );

  it.each([...TYPE_CHECKED_TEST_FILES, CO_LOCATED_TEST_FILE])('refuses any and aliases of this in the test file %s, as in app code', async (file) => {
    const rules = await rulesFor(everyCommit, file);

    expect(RULES_TESTS_ONCE_TURNED_OFF.filter((rule) => !isError(rules[rule]))).toEqual([]);
  });
});
