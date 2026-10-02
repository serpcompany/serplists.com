import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

import { onlyElement } from '../../support/elements';

const eslint = new ESLint({ cwd: process.cwd() });
const RULE = '@typescript-eslint/naming-convention';

const namingReports = async (code: string, filePath: string): Promise<string[]> =>
  onlyElement(await eslint.lintText(code, { filePath }))
    .messages.filter((message) => message.ruleId === RULE)
    .map((message) => message.message);

describe('naming conventions on every TypeScript file', { timeout: 30_000 }, () => {
  it.each([
    ['a snake_case module constant', 'export const user_id = 1;\n', 'src/lib/sample.ts'],
    ['a snake_case Drizzle table export', "export const checklist_runs = sqliteTable('checklist_runs', {});\n", 'db/schema/sample.ts'],
    ['an UPPER_CASE constant inside a function', 'export function load() { const MAX_ROWS = 5; return MAX_ROWS; }\n', 'functions/api/sample.ts'],
    ['a one-word capitalized constant inside a describe block', "describe('a', () => { const SELF = 'user-1'; it('b', () => SELF); });\n", 'tests/unit/sample.test.ts'],
    ['an UPPER_CASE module variable that is not const', 'export let MUTABLE_LIMIT = 1;\n', 'src/lib/sample.ts'],
    ['a leading underscore on a destructured name', 'export const rest = () => { const { a: _a, ...others } = { a: 1, b: 2 }; return others; };\n', 'src/lib/sample.ts'],
    ['a trailing underscore', 'export const value_ = 1;\n', 'src/lib/sample.ts'],
    ['a snake_case parameter', 'export function load(user_id: string) { return user_id; }\n', 'functions/api/sample.ts'],
    ['an UPPER_CASE parameter', 'export function read(URL: string) { return URL; }\n', 'tests/support/sample.ts'],
    ['a snake_case type', 'export type user_row = { id: string };\n', 'src/lib/sample.ts'],
    ['a snake_case class property', "export class Store { private cache_key = ''; read() { return this.cache_key; } }\n", 'src/lib/sample.ts'],
    ['an HTTP method name on a function no route module exports', 'function GET() { return 1; }\nexport const handler = GET;\n', 'src/app/sample/route.ts'],
  ])('refuses %s', async (_label, code, filePath) => {
    expect(await namingReports(code, filePath)).not.toEqual([]);
  });

  it.each([
    ['UPPER_CASE for a module constant', 'export const MAX_ROWS = 5;\n', 'src/lib/sample.ts'],
    ['a camelCase table export holding the SQL names', "export const checklistRuns = sqliteTable('checklist_runs', { user_id: text('user_id') });\n", 'db/schema/sample.ts'],
    ['object and type properties that mirror D1 columns, JSON fields and HTTP headers', "export const row = { user_id: 'u', 'X-Request-Id': 'r' };\nexport type Row = { share_token: string; 'content-type': string };\n", 'functions/api/sample.ts'],
    ['enum members and object literal methods named by an external contract', "export enum Plan { free_tier = 'free' }\nexport const tools = { get_run() { return 1; } };\n", 'functions/api/sample.ts'],
    ['destructured names, which keep the name of the field they read', "const { user_id, DB } = { user_id: 'u', DB: 1 };\nexport function read({ share_token }: { share_token: string }) { return [user_id, DB, share_token]; }\n", 'tests/unit/sample.test.ts'],
    ['a leading underscore on a parameter kept for its type', 'export function handle(_request: Request, env: unknown) { return env; }\n', 'functions/api/sample.ts'],
    ['PascalCase for React components, classes, types and type parameters', 'export const Card = () => null;\nexport function Title<TItem>(item: TItem) { const Icon = item; return Icon; }\nexport class SEOMetaEditor {}\n', 'src/components/sample.tsx'],
    ['a component taken as a PascalCase parameter', 'export function Section({ as: Heading }: { as: string }) { return Heading; }\n', 'src/components/sample.tsx'],
    ['the HTTP method names a Next.js route module exports', 'export async function GET() { return new Response(); }\n', 'src/app/sample/route.ts'],
    ["an import under its exporter's name", "import React from 'react';\nimport { Geist_Mono } from 'next/font/google';\nexport const all = [React, Geist_Mono];\n", 'src/app/sample.tsx'],
    ["a stand-in that exports a module's names", 'const geistMono = font();\nexport { geistMono as Geist_Mono };\n', 'tests/support/sample.ts'],
    ["React DOM's root container interface, which a fake DOM augments", "declare module 'react-dom/client' {\n  interface DO_NOT_USE_OR_YOU_WILL_BE_FIRED_EXPERIMENTAL_CREATE_ROOT_CONTAINERS { fake: unknown }\n}\n", 'tests/fixtures/sample.ts'],
  ])('allows %s', async (_label, code, filePath) => {
    expect(await namingReports(code, filePath)).toEqual([]);
  });
});
