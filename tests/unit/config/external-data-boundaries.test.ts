import { readFileSync } from 'node:fs';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

const UNSAFE_ANY_RULES = [
  '@typescript-eslint/no-unsafe-argument',
  '@typescript-eslint/no-unsafe-assignment',
  '@typescript-eslint/no-unsafe-call',
  '@typescript-eslint/no-unsafe-member-access',
  '@typescript-eslint/no-unsafe-return',
];
const CAST_RULE = 'serplists/no-external-data-casts';
const ASSERTION_RULE = '@typescript-eslint/no-unsafe-type-assertion';
const TYPE_AWARE_CONFIG = 'eslint.type-aware.config.js';

const TYPE_CHECKED_FILES = [
  'src/lib/api/request.ts',
  'src/components/shared/ContentRenderer.tsx',
  'functions/api/handlers/stripe.ts',
  'scripts/generate-db-schema-doc.ts',
  'db/schema/templates.ts',
];

const isError = (setting: unknown) => Array.isArray(setting) && setting[0] === 2;

const rulesFor = async (eslint: ESLint, file: string): Promise<Record<string, unknown>> =>
  z.object({ rules: z.record(z.unknown()) }).parse(await eslint.calculateConfigForFile(file)).rules;

const lintScript = z
  .object({ scripts: z.object({ lint: z.string() }) })
  .parse(JSON.parse(readFileSync('package.json', 'utf8'))).scripts.lint;

describe('external data is parsed at the boundary, not cast', { timeout: 30_000 }, () => {
  const typeAware = new ESLint({ cwd: process.cwd(), overrideConfigFile: TYPE_AWARE_CONFIG });
  const everyCommit = new ESLint({ cwd: process.cwd() });

  it('runs pnpm run lint with the type-aware config, so verify and CI refuse unsafe any', () => {
    expect(lintScript).toBe(`eslint --config ${TYPE_AWARE_CONFIG} .`);
  });

  it.each(TYPE_CHECKED_FILES)('refuses unsafe any, external data casts and narrowing type assertions in %s', async (file) => {
    const rules = await rulesFor(typeAware, file);

    expect(UNSAFE_ANY_RULES.filter((rule) => !isError(rules[rule]))).toEqual([]);
    expect(isError(rules[CAST_RULE])).toBe(true);
    expect(isError(rules[ASSERTION_RULE])).toBe(true);
  });

  it.each([...TYPE_CHECKED_FILES, 'scripts/lib/run-tool.mjs'])('refuses external data casts in %s on every commit', async (file) => {
    expect(isError((await rulesFor(everyCommit, file))[CAST_RULE])).toBe(true);
  });
});
