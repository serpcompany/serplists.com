import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { expect, it } from 'vitest';
import { buildDataOperationPlan } from './data-operations-lib.mjs';
import { loadEnvironmentInventory, resolveEnvironmentIdentity } from './environment-identity-lib.mjs';
import { captureFullRecoveryState, fullRecoveryStatesEqual } from './recovery-restore-lib.mjs';
import { compareDatabaseSchemas, generateSchemaSnapshot, inspectDatabase, replayMigrations } from './schema-contract';

const repoRoot = resolve('.');
const identity = resolveEnvironmentIdentity({ environment: 'rehearsal', inventory: loadEnvironmentInventory({ repoRoot }),
  databaseName: 'serp-checklists-rehearsal-156', databaseId: '8ab2b7e9-0ce8-4d1e-b42f-8601eb256b67' });

// _cf_ names below are in-memory-only fail-closed controls: real D1 reserves
// that prefix. sqlitex_retained and acfx_retained are legal application names.
it.each(['rehearsal-baseline', 'recovery-restore'].flatMap(operation =>
  ['sqlitex_retained', 'acfx_retained', '_cf_unreviewed', 'd1_migrations'].map(name => [operation, name])))('%s counts %s before writes', (operation, name) => {
  const plan = buildDataOperationPlan({ operation, identity, repoRoot, gitCommit: '7959ff2', beforeMigration: 'none',
    outputPath: undefined, importManifest: undefined, confirmationDatabaseId: undefined, persistTo: undefined,
    migrationRange: undefined, sourceSchema: undefined,
    importPath: 'tmp/rehearsal-sensitive/156.sql', importSql: 'PRAGMA defer_foreign_keys=TRUE; CREATE TABLE restored(v TEXT);' });
  const sql = plan.preconditionCommand!.find((arg: string) => arg.startsWith('--command=')).slice('--command='.length);
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY, value BLOB);');
    expect(db.prepare(sql).get()?.total_objects).toBe(0);
    db.exec(`CREATE TABLE ${name}(v TEXT);`);
    expect(db.prepare(sql).get()?.total_objects, name).toBe(1);
    db.exec(`DROP TABLE ${name}`);
    db.exec('CREATE VIEW acfx_retained AS SELECT 1;');
    expect(db.prepare(sql).get()?.total_objects).toBe(1);
  } finally { db.close(); }
});

it.each(['sqlitex_retained', 'acfx_retained'].flatMap(name => ['catalog', 'snapshot'].map(reader => [name, reader])))('local %s %s retains legal table', (name, reader) => {
  const db = replayMigrations();
  try {
    const before = inspectDatabase(db);
    expect(compareDatabaseSchemas(before, inspectDatabase(db)).verdict).toBe('pass');
    db.exec(`CREATE TABLE ${name}(v TEXT);`);
    if (reader === 'catalog') expect(compareDatabaseSchemas(before, inspectDatabase(db)).verdict).toBe('fail');
    else expect(generateSchemaSnapshot(db)).toContain(`CREATE TABLE ${name}`);
  } finally { db.close(); }
});

it.each(['sqlitex_retained', 'acfx_retained', '_cf_unreviewed'].flatMap(name =>
  ['row', 'view', 'index', 'trigger'].map(change => [name, change])))('recovery detects %s %s changes', (name, change) => {
  const db = new DatabaseSync(':memory:');
  const capture = () => captureFullRecoveryState({ key: '156'.repeat(16), query: (sql: string) => [{ success: true, meta: {}, results: db.prepare(sql).all() }] });
  try {
    db.exec(`CREATE TABLE _cf_METADATA(key INTEGER PRIMARY KEY, value BLOB);
      CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT);
      CREATE TABLE ${name}(v TEXT); INSERT INTO ${name} VALUES ('before');`);
    const before = capture();
    db.exec("INSERT INTO _cf_METADATA VALUES (1,'platform')");
    expect(fullRecoveryStatesEqual(before, capture())).toBe(true);
    db.exec({ row: `UPDATE ${name} SET v='after'`, view: `CREATE VIEW ${name}_view AS SELECT * FROM ${name}`,
      index: `CREATE INDEX ${name}_index ON ${name}(v)`, trigger: `CREATE TRIGGER ${name}_trigger AFTER INSERT ON ${name} BEGIN SELECT 1; END` }[change]!);
    expect(fullRecoveryStatesEqual(before, capture())).toBe(false);
  } finally { db.close(); }
});

it('sanitizer cleanup query selects legal sqlite lookalikes', () => {
  // Exercise the actual private cleanup query, not a reimplemented predicate.
  const source = readFileSync(resolve('scripts/data/sanitizer-lib.mjs'), 'utf8');
  const sql = source.match(/function emptyData\(database\)[\s\S]*?prepare\("([^"]+)"\)\.all\(\)\) database\.exec\(`DELETE/)?.[1];
  expect(sql).toBeDefined();
  const db = new DatabaseSync(':memory:');
  try {
    db.exec('CREATE TABLE sqlitex_retained(v TEXT); INSERT INTO sqlitex_retained VALUES (\'private\');');
    expect(db.prepare(sql!).all().map(row => row.name)).toContain('sqlitex_retained');
  } finally { db.close(); }
});
