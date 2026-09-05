import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { catalogFromPragmaResults, compareDatabaseSchemas, inspectDatabase, listMigrationFiles, parseRemoteTableInventory, replayMigrations } from './schema-contract';

// Execute the CLI's catalog query shape against SQLite, without transforming values.
function remoteCatalog(db: DatabaseSync, shuffle = false) {
  const names = (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(row => row.name);
  const quoted = names.map(name => `'${name.replaceAll("'", "''")}'`);
  const queries = [
    ...quoted.map(name => `PRAGMA table_info(${name})`),
    ...quoted.map(name => `PRAGMA index_list(${name})`),
    ...quoted.map(name => `SELECT il.name AS index_name, ii.seqno, ii.name AS column_name, sm.sql AS index_sql FROM pragma_index_list(${name}) AS il JOIN pragma_index_info(il.name) AS ii LEFT JOIN sqlite_schema AS sm ON sm.type = 'index' AND sm.name = il.name ORDER BY il.name, ii.seqno`),
    ...quoted.map(name => `PRAGMA foreign_key_list(${name})`),
    "SELECT type AS object_type, name, tbl_name AS table_name, sql FROM sqlite_schema WHERE type IN ('table','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
  ];
  return catalogFromPragmaResults(names, queries.map((sql, index) => {
    const results = db.prepare(sql).all();
    // Metadata sets are unordered; index_info.seqno and FK.seq retain key order.
    return { results: shuffle && index >= names.length ? results.reverse() : results };
  }));
}

function catalog(sql: string, remote = false) {
  const db = new DatabaseSync(':memory:');
  try { db.exec(sql); return remote ? remoteCatalog(db, true) : inspectDatabase(db); }
  finally { db.close(); }
}

describe('shared SQLite catalog canonicalization', () => {
  it('exempts only the exact D1 metadata table from remote inventory', () => {
    const output = JSON.stringify([{ results: [
      { name: '_cf_METADATA' },
      { name: '_cf_unreviewed' },
      { name: 'templates' },
    ] }]);
    expect(parseRemoteTableInventory(output)).toEqual(['_cf_unreviewed', 'templates']);
  });

  it('matches the complete real migration replay through both catalog readers', () => {
    const db = replayMigrations();
    try {
      const local = inspectDatabase(db);
      const remote = remoteCatalog(db);
      expect(compareDatabaseSchemas(local, remote)).toEqual({ verdict: 'pass', differences: [] });
      expect(remote).toEqual(local);
      expect(remoteCatalog(db, true)).toEqual(local);
    } finally { db.close(); }
  });

  it.each(['current_timestamp', '(CURRENT_TIMESTAMP)', '((current_timestamp))'])('accepts equivalent default %s', value => {
    expect(compareDatabaseSchemas(catalog('CREATE TABLE t (v TEXT DEFAULT CURRENT_TIMESTAMP)'), catalog(`CREATE TABLE t (v TEXT DEFAULT ${value})`, true)).verdict).toBe('pass');
  });

  const base = `CREATE TABLE p (a TEXT, b TEXT, PRIMARY KEY(a,b));
    CREATE TABLE t (a TEXT NOT NULL, b TEXT DEFAULT 'Case  sensitive', c INTEGER DEFAULT ((1)+(2)), PRIMARY KEY(a,b), FOREIGN KEY(a,b) REFERENCES p(a,b) ON DELETE CASCADE);
    CREATE UNIQUE INDEX ia ON t(a,b) WHERE c > 0;
    CREATE INDEX ib ON t(b);`;
  it.each([
    ['missing column', base.replace('c INTEGER DEFAULT ((1)+(2)), ', '').replace(' WHERE c > 0', '')],
    ['type', base.replace('c INTEGER', 'c INT')],
    ['nullability', base.replace('c INTEGER', 'c INTEGER NOT NULL')],
    ['literal case', base.replace('Case  sensitive', 'case  sensitive')],
    ['literal whitespace', base.replace('Case  sensitive', 'Case sensitive')],
    ['expression', base.replace('((1)+(2))', '((1)-(2))')],
    ['expression grouping', base.replace('((1)+(2))', '((1+2)*3)')],
    ['primary key order', base.replace('PRIMARY KEY(a,b), FOREIGN', 'PRIMARY KEY(b,a), FOREIGN')],
    ['foreign key action', base.replace('ON DELETE CASCADE', 'ON DELETE RESTRICT')],
    ['foreign key columns', base.replace('REFERENCES p(a,b)', 'REFERENCES p(b,a)')],
    ['missing index', base.replace('CREATE INDEX ib ON t(b);', '')],
    ['index uniqueness', base.replace('CREATE UNIQUE INDEX', 'CREATE INDEX')],
    ['index columns', base.replace('ia ON t(a,b)', 'ia ON t(b,a)')],
    ['index predicate', base.replace('WHERE c > 0', 'WHERE c > 1')],
    ['check constraint', base.replace('a TEXT NOT NULL', 'a TEXT NOT NULL CHECK(length(a) >= 1)')],
    ['collation', base.replace('a TEXT NOT NULL', 'a TEXT NOT NULL COLLATE NOCASE')],
    ['conflict clause', base.replace('a TEXT NOT NULL', 'a TEXT NOT NULL ON CONFLICT REPLACE')],
    ['table option', base.replace('ON DELETE CASCADE);', 'ON DELETE CASCADE) STRICT;')],
  ])('rejects genuine SQLite drift: %s', (_name, changed) => {
    expect(compareDatabaseSchemas(catalog(base), catalog(changed, true)).verdict).toBe('fail');
  });

  it('rejects generated-column expression drift omitted by PRAGMA table_info', () => {
    const expected = catalog('CREATE TABLE t(a INTEGER, doubled INTEGER GENERATED ALWAYS AS (a * 2) STORED)');
    const actual = catalog('CREATE TABLE t(a INTEGER, doubled INTEGER GENERATED ALWAYS AS (a * 3) STORED)', true);
    expect(compareDatabaseSchemas(expected, actual)).toEqual({ verdict: 'fail', differences: ['table t differs'] });
  });

  it('normalizes only unquoted SQL spelling and layout in table definitions', () => {
    const expected = catalog(`CREATE TABLE t ("CaseSensitive" TEXT CHECK("CaseSensitive" <> 'Keep  Case')) STRICT`);
    const equivalentLayout = catalog(`create table t( "CaseSensitive" text check ( "CaseSensitive"<>'Keep  Case' ) ) strict`, true);
    const changedQuotedIdentifier = catalog(`create table t( "casesensitive" text check ( "casesensitive"<>'Keep  Case' ) ) strict`, true);
    const changedQuotedLiteral = catalog(`create table t( "CaseSensitive" text check ( "CaseSensitive"<>'keep  Case' ) ) strict`, true);
    expect(compareDatabaseSchemas(expected, equivalentLayout).verdict).toBe('pass');
    expect(compareDatabaseSchemas(expected, changedQuotedIdentifier).verdict).toBe('fail');
    expect(compareDatabaseSchemas(expected, changedQuotedLiteral).verdict).toBe('fail');
  });

  it('preserves quoted default contents and parentheses inside literals', () => {
    for (const [a, b] of [["'a  b'", "'a b'"], ['"Case"', '"case"'], ["('(' || ')')", "('(' || ' )')"], ['((1)+(2))', '((1)-(2))']]) {
      expect(compareDatabaseSchemas(catalog(`CREATE TABLE t(v TEXT DEFAULT ${a})`), catalog(`CREATE TABLE t(v TEXT DEFAULT ${b})`, true)).verdict).toBe('fail');
    }
  });

  it('retains explicit NULL defaults consistently and preserves quoted NULL', () => {
    const db = new DatabaseSync(':memory:');
    try {
      db.exec("CREATE TABLE t(a TEXT DEFAULT NULL, b TEXT DEFAULT 'NULL')");
      expect(remoteCatalog(db)).toEqual(inspectDatabase(db));
      expect(remoteCatalog(db).tables.t.columns.map(column => column.defaultValue)).toEqual(['null', "'NULL'"]);
    } finally { db.close(); }
  });
});

describe.skipIf(process.platform === 'win32')('direct schema CLI with unchanged real SQLite query results', () => {
  const rebuildEntitlementOverrides = (columnSuffix = '', tableSuffix = '') => `
    ALTER TABLE entitlement_overrides RENAME TO entitlement_overrides_old;
    CREATE TABLE entitlement_overrides (
      user_id TEXT PRIMARY KEY,
      plan TEXT NOT NULL${columnSuffix},
      expires_at INTEGER,
      note TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT
    )${tableSuffix};
    INSERT INTO entitlement_overrides(user_id, plan, expires_at, note, created_at, updated_at)
      SELECT user_id, plan, expires_at, note, created_at, updated_at FROM entitlement_overrides_old;
    DROP TABLE entitlement_overrides_old;
  `;
  it.each([
    ['complete replay', '', 'pass'],
    ['missing index', 'DROP INDEX idx_users_email', 'fail'],
    ['extra column', 'ALTER TABLE users ADD COLUMN canonicalization_drift TEXT', 'fail'],
    ['CHECK constraint drift', rebuildEntitlementOverrides(" CHECK(plan IN ('free', 'pro'))"), 'fail'],
    ['generated expression drift', rebuildEntitlementOverrides(', plan_key TEXT GENERATED ALWAYS AS (lower(plan)) VIRTUAL'), 'fail'],
    ['collation drift', rebuildEntitlementOverrides(' COLLATE NOCASE'), 'fail'],
    ['conflict-clause drift', rebuildEntitlementOverrides(' ON CONFLICT REPLACE'), 'fail'],
    ['table-option drift', rebuildEntitlementOverrides('', ' STRICT'), 'fail'],
    ['unknown ledger identity', "INSERT INTO d1_migrations VALUES (9999, '9999_private_ledger_name.sql')", 'fail', 'pass', '9999_private_ledger_name.sql'],
  ])('%s produces the expected CLI verdict', (_name, change, verdict, schemaVerdict = verdict, privateMarker?: string) => {
    const directory = mkdtempSync(join(tmpdir(), 'schema-canonicalization-119-'));
    const file = join(directory, 'catalog.sqlite');
    const db = replayMigrations();
    try {
      db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL)');
      const insert = db.prepare('INSERT INTO d1_migrations VALUES (?, ?)');
      listMigrationFiles().forEach((migration, index) => insert.run(index + 1, migration.name));
      if (change) db.exec(change);
      db.exec(`VACUUM INTO '${file.replaceAll("'", "''")}'`);
    } finally { db.close(); }
    const stub = join(directory, 'pnpm');
    const databaseId = '11111111-1111-4111-8111-111111111111';
    // Only the subprocess transport is replaced. Every catalog/ledger SQL statement
    // executes as received against the replay; no result normalization lives here.
    writeFileSync(stub, `#!${process.execPath}
const {DatabaseSync}=require('node:sqlite');
const args=process.argv.slice(2);
if(args.includes('info')){console.log(JSON.stringify({name:'fixture-db',uuid:'${databaseId}'}));process.exit(0);}
const sql=args[args.indexOf('--command')+1];
const db=new DatabaseSync(${JSON.stringify(file)},{readOnly:true});
try{console.log(JSON.stringify(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>({results:db.prepare(s).all()}))));}finally{db.close();}
`);
    chmodSync(stub, 0o700);
    try {
      const result = spawnSync(process.execPath, ['--import', 'tsx', 'scripts/data/check-d1-schema.ts', '--database', 'fixture-db', '--database-id', databaseId, '--label', 'staging', '--report-dir', directory], {
        cwd: resolve('.'), env: { PATH: `${directory}:${process.env.PATH}`, HOME: directory, CI: '1' }, encoding: 'utf8', timeout: 20_000,
      });
      expect(result.status, result.stdout + result.stderr).toBe(verdict === 'pass' ? 0 : 1);
      const report = JSON.parse(readFileSync(join(directory, 'd1-schema-staging.json'), 'utf8'));
      expect(report.verdict).toBe(verdict);
      expect(report).toMatchObject({
        commit: expect.stringMatching(/^[a-f0-9]{40}$/),
        target: {
          environment: 'staging',
          binding: 'DB',
          databaseName: 'fixture-db',
          databaseId,
        },
        migrationRange: {
          from: listMigrationFiles()[0].name,
          to: listMigrationFiles().at(-1)!.name,
        },
      });
      const readable = readFileSync(join(directory, 'd1-schema-staging.md'), 'utf8');
      for (const value of ['environment=staging', 'binding=DB', 'databaseName=fixture-db', `databaseId=${databaseId}`, `commit=${report.commit}`, `migration=${report.migrationRange.from}->${report.migrationRange.to}`]) {
        expect(readable).toContain(value);
      }
      expect(report.schemaDifferences.migrationObjects.verdict).toBe(schemaVerdict);
      if (schemaVerdict === 'fail') expect(report.schemaDifferences.migrationObjects.differenceCount).toBe(1);
      if (privateMarker) {
        for (const contents of [result.stdout, result.stderr, ...['json', 'md', 'txt', 'junit.xml'].map(extension => readFileSync(join(directory, `d1-schema-staging.${extension}`), 'utf8'))]) {
          expect(contents).not.toContain(privateMarker);
        }
        expect(report.ledger).toMatchObject({ status: 'drift', unknownCount: 1, knownCount: listMigrationFiles().length, verdict: 'fail' });
        expect(report.ledger).not.toHaveProperty('applied');
        expect(report.ledger).not.toHaveProperty('unexpected');
      }
      expect(readFileSync(join(directory, 'd1-schema-staging.junit.xml'), 'utf8')).toContain(`failures="${verdict === 'pass' ? 0 : 1}"`);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
