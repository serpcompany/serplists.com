import { DatabaseSync } from 'node:sqlite';
import { normalizeSql, replayMigrations } from './schema-contract.ts';
import { digest } from './production-preparation-lib.mjs';
import { sourceSchemaBinding } from './source-schema-proof.mjs';
import { parseAppliedMigrationLedger } from './invariant-capture-lib.mjs';
import { wrapCanarySubprocessFailure } from './canary-diagnostics.mjs';

// Full definitions retain CHECK/UNIQUE/conflict clauses, generated columns,
// collations, index expressions/order, and table options absent from PRAGMAs.
// The ledger is separately validated. SQLite-owned objects and D1's exact
// platform metadata table are engine state, not application schema. Do not
// exclude the whole _cf_ prefix: other unreviewed objects must still fail.
export const SOURCE_CATALOG_SQL = "SELECT type, name, tbl_name, sql FROM sqlite_schema WHERE name NOT GLOB 'sqlite_*' AND name != 'd1_migrations' AND NOT (type = 'table' AND name = '_cf_METADATA') ORDER BY type, name";
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function canonicalCatalog(rows: unknown) {
  if (!Array.isArray(rows)) throw new Error('Invalid catalog.');
  return rows.map((row: unknown) => {
    if (!isRecord(row) || typeof row.type !== 'string' || !['table', 'index', 'trigger', 'view'].includes(row.type) ||
        typeof row.name !== 'string' || typeof row.tbl_name !== 'string' || typeof row.sql !== 'string') throw new Error('Invalid catalog.');
    // Preserve quoted tokens: SQLite can interpret double quotes as string values.
    return { type: row.type, name: row.name, table: row.tbl_name, sql: normalizeSql(row.sql, true) };
  })
    .sort((a, b) => `${a.type}:${a.name}`.localeCompare(`${b.type}:${b.name}`, 'en'));
}

// tsImport uses a separate module cache. The executor supplies its own wrapper
// so subprocess status and safe stages remain in its private diagnostic registry.
export function inspectSourceSchema({ commit, database, pendingMigrations, execute, wrapFailure = wrapCanarySubprocessFailure }: {
  commit: string;
  database: { databaseName: string; databaseId: string };
  pendingMigrations: string[];
  execute: (sql: string) => string;
  wrapFailure?: typeof wrapCanarySubprocessFailure;
}) {
  let expected;
  try {
    const appliedMigrations = parseAppliedMigrationLedger(execute('SELECT id, name FROM d1_migrations ORDER BY id'));
    const binding = sourceSchemaBinding({ commit, database, pendingMigrations, appliedMigrations, ledgerSha256: digest(appliedMigrations) });
    expected = appliedMigrations.length ? replayMigrations({ through: appliedMigrations.at(-1) }) : new DatabaseSync(':memory:');
    const expectedCatalog = canonicalCatalog(expected.prepare(SOURCE_CATALOG_SQL).all());
    const response = JSON.parse(execute(SOURCE_CATALOG_SQL));
    if (!Array.isArray(response) || response.length !== 1 || response[0]?.success === false) throw new Error('Invalid catalog response.');
    const actualCatalog = canonicalCatalog(response[0].results);
    if (JSON.stringify(actualCatalog) !== JSON.stringify(expectedCatalog)) throw new Error('Source catalog drift.');
    const ledgerAfter = parseAppliedMigrationLedger(execute('SELECT id, name FROM d1_migrations ORDER BY id'));
    if (digest(ledgerAfter) !== binding.ledgerSha256) throw new Error('Source ledger changed.');
    const evidence = { ...binding, catalogSha256: digest(expectedCatalog), objectCount: expectedCatalog.length };
    return { type: 'source-schema', verdict: 'pass', ...evidence, proofSha256: digest(evidence) };
  } catch (error) { throw wrapFailure('production-source-schema', error); }
  finally { expected?.close(); }
}
