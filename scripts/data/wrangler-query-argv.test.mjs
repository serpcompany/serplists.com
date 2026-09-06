import { it, expect } from 'vitest';
import { Module, createRequire } from 'node:module';
import { readFileSync } from 'node:fs';
import { buildDataOperationPlan } from './data-operations-lib.mjs';
import { resolveEnvironmentIdentity, loadEnvironmentInventory } from './environment-identity-lib.mjs';

const repoRoot = new URL('../../', import.meta.url).pathname;
const require = createRequire(import.meta.url);
const filename = require.resolve('wrangler');
// Exercise the parser bundled in pinned Wrangler with its actual D1 option
// definitions. Export only a parser in memory: no handler, auth or D1 execution.
const bundled = new Module(filename);
bundled.filename = filename;
bundled.paths = Module._nodeModulePaths(new URL('.', `file://${filename}`).pathname);
bundled._compile(readFileSync(filename, 'utf8') + `
exports.parseD1Arguments = argv => yargs_default(argv).strict().exitProcess(false)
  .showHelpOnFail(false).fail((message, error) => { throw error || new Error(message); })
  .options(d1ExecuteCommand.args).parseSync();
`, filename);
const parse = argv => bundled.exports.parseD1Arguments(['--database=fixture', ...argv]);

it('parses exact repository invariant SQL from remote operation plans with pinned Wrangler', () => {
  const identity = resolveEnvironmentIdentity({ environment: 'staging', inventory: loadEnvironmentInventory({ repoRoot }) });
  const plan = buildDataOperationPlan({ operation: 'invariant-capture', identity, repoRoot, gitCommit: 'a'.repeat(40) });
  for (const [command, file] of [[plan.command, `${repoRoot}scripts/data/sql/capture-invariants.sql`],
    ...plan.versionedInvariantCommands.map(entry => [entry.command, entry.sqlPath])]) {
    expect(parse(command.slice(6)).command).toBe(readFileSync(file, 'utf8'));
  }
});

it.each(['-- leading comment\nSELECT 1;', '-- a=b\nSELECT \'a=b\' AS "quoted=value";\nSELECT \'it\'\'s exact\';', 'SELECT 1;'])
('preserves exact SQL through the actual bundled parser: %s', sql => {
  expect(parse([`--command=${sql}`]).command).toBe(sql);
});

it('detects the original split-argument failure for SQL beginning with a comment', () => {
  expect(() => parse(['--command', '-- leading comment\nSELECT 1;'])).toThrow(/Unknown argument/);
});
