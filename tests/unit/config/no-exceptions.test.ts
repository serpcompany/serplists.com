import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import { walkFiles } from '../../../scripts/lib/repo-files.mjs';

const repoRoot = process.cwd();
const readText = (file: string) => readFileSync(path.join(repoRoot, file), 'utf8');

const MAX_LINES = 500;

const packageScripts = z
  .object({ scripts: z.record(z.string()) })
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

const sourceFiles = [
  ...walkFiles(repoRoot, 'src', (file: string) => /\.(ts|tsx)$/.test(file) && !file.endsWith('.d.ts')),
  ...walkFiles(repoRoot, 'functions', (file: string) => file.endsWith('.ts') && !file.endsWith('.d.ts')),
];

const dependencyRules = z
  .object({ forbidden: z.array(z.object({ name: z.string(), severity: z.string() })) })
  .parse(createRequire(import.meta.url)(path.join(repoRoot, '.dependency-cruiser.cjs'))).forbidden;

const testFileArguments = (script: string, flag?: string) =>
  [...script.matchAll(flag ? new RegExp(`${flag}\\s+(\\S+\\.test\\.\\w+)`, 'g') : /(?:^|\s)(tests\/\S+\.test\.\w+)/g)]
    .map(([, file]) => file)
    .sort();

describe('no exceptions to the repository checks', { timeout: 60_000 }, () => {
  it('holds every source file in src/ and functions/ to the same 500-line limit', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const exempt: string[] = [];
    for (const file of sourceFiles) {
      const rule = (await eslint.calculateConfigForFile(file))?.rules?.['max-lines'];
      const options = Array.isArray(rule) ? rule[1] : undefined;
      const held =
        Array.isArray(rule) &&
        rule[0] === 2 &&
        options?.max === MAX_LINES &&
        options?.skipBlankLines !== true &&
        options?.skipComments !== true;
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

  it('runs every test file the unit run excludes in the local D1 run, and nothing else there', () => {
    expect(
      testFileArguments(packageScripts['test:run'], '--exclude'),
      'A test file excluded from pnpm run test:run must run in pnpm run test:local-d1, or no suite runs it. ' +
        'Add it to test:local-d1, or stop excluding it.',
    ).toEqual(testFileArguments(packageScripts['test:local-d1']));
  });

  it('refuses skipped, todo, fixme and focused tests in Vitest and Playwright files', async () => {
    const eslint = new ESLint({ cwd: repoRoot });
    const refusals = async (code: string, filePath: string) => {
      const [result] = await eslint.lintText(code, { filePath });
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
