import { DatabaseSync } from 'node:sqlite';
import { spawnSync } from 'node:child_process';
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { buildCatalogContract, diffDrizzleContract, catalogFromPragmaResults, compareDatabaseSchemas, inspectDatabase, listMigrationFiles, parseRemoteTableInventory, replayMigrations } from './schema-contract';

// Execute the CLI's catalog query shape against SQLite, without transforming values.
function remoteCatalog(db: DatabaseSync, shuffle = false, transform = (rows: Record<string, unknown>[]) => rows) {
  const names = (db.prepare("SELECT name FROM sqlite_schema WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name").all() as { name: string }[]).map(row => row.name);
  const quoted = names.map(name => `'${name.replaceAll("'", "''")}'`);
  const queries = [
    ...quoted.map(name => `PRAGMA table_info(${name})`),
    ...quoted.map(name => `PRAGMA index_list(${name})`),
    ...quoted.map(name => `SELECT il.name AS index_name, ii.seqno, ii.cid, ii.name AS column_name, ii.name IS NULL AS column_name_is_null, ii.coll, ii.desc, ii.key, sm.sql AS index_sql, sm.sql IS NULL AS index_sql_is_null FROM pragma_index_list(${name}) AS il JOIN pragma_index_xinfo(il.name) AS ii LEFT JOIN sqlite_schema AS sm ON sm.type = 'index' AND sm.name = il.name ORDER BY il.name, ii.seqno`),
    ...quoted.map(name => `PRAGMA foreign_key_list(${name})`),
    "SELECT type AS object_type, name, tbl_name AS table_name, sql FROM sqlite_schema WHERE type IN ('table','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name",
  ];
  return catalogFromPragmaResults(names, queries.map((sql, index) => {
    const results = transform(db.prepare(sql).all());
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
  it('decodes flagged Wrangler SQL nulls without changing a literal column named null', () => {
    const db = replayMigrations();
    try {
      db.exec('CREATE TABLE null_probe("null" TEXT UNIQUE, v TEXT); CREATE INDEX expr_probe ON null_probe(lower(v)); CREATE INDEX named_null_probe ON null_probe("null")');
      const expected = inspectDatabase(db);
      const actual = remoteCatalog(db, true, rows => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) =>
        [key, ['index_sql', 'column_name'].includes(key) && value === null ? 'null' : value]))));
      expect(compareDatabaseSchemas(expected, actual).verdict).toBe('pass');
      expect(diffDrizzleContract(buildCatalogContract(expected), actual).verdict).toBe('pass');
      expect(actual.tables.null_probe.indexes.find(index => index.name === 'named_null_probe')?.keys?.[0].column).toBe('null');
      expect(actual.tables.null_probe.indexes.find(index => index.name === 'expr_probe')?.keys?.[0].column).toBeNull();
    } finally { db.close(); }
  });
  it('rejects NOCASE username index drift that rejects previously valid case-distinct usernames', () => {
    const db = replayMigrations();
    try {
      const baseline = inspectDatabase(db);
      const insert = db.prepare("INSERT INTO users(id,email,password_hash,created_at,username) VALUES (?,?, 'fixture', '2026-09-05', ?)");
      insert.run('one', 'one@example.test', 'Owner119');
      expect(() => insert.run('two', 'two@example.test', 'owner119')).not.toThrow();
      db.exec("DELETE FROM users; DROP INDEX idx_users_username; CREATE UNIQUE INDEX idx_users_username ON users(username COLLATE NOCASE)");
      insert.run('one', 'one@example.test', 'Owner119');
      expect(() => insert.run('two', 'two@example.test', 'owner119')).toThrow(/UNIQUE/);
      expect(compareDatabaseSchemas(baseline, inspectDatabase(db)).verdict).toBe('fail');
      expect(diffDrizzleContract(buildCatalogContract(baseline), inspectDatabase(db)).verdict).toBe('fail');
      expect(compareDatabaseSchemas(baseline, remoteCatalog(db)).verdict).toBe('fail');
      expect(diffDrizzleContract(buildCatalogContract(baseline), remoteCatalog(db)).verdict).toBe('fail');
    } finally { db.close(); }
  });
  it('exempts only the exact D1 metadata table from remote inventory', () => {
    const output = JSON.stringify([{ results: [
      { name: '_cf_METADATA' },
      { name: '_cf_unreviewed' },
      { name: 'templates' },
    ] }]);
    expect(parseRemoteTableInventory(output)).toEqual(['_cf_unreviewed', 'templates']);
  });

  it.each([
    ['collation', 'CREATE UNIQUE INDEX idx_users_username ON users(username COLLATE NOCASE)'],
    ['order', 'CREATE UNIQUE INDEX idx_users_username ON users(username DESC)'],
    ['expression', 'CREATE UNIQUE INDEX idx_users_username ON users(lower(username))'],
    ['predicate', "CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username <> ''"],
    ['uniqueness', 'CREATE INDEX idx_users_username ON users(username)'],
    ['missing', ''],
    ['unknown', 'CREATE UNIQUE INDEX unreviewed_username ON users(username)'],
  ])('rejects replay index %s drift in local and remote catalog and migration comparisons', (_label, replacement) => {
    const db = replayMigrations();
    try {
      const expected = inspectDatabase(db);
      const contract = buildCatalogContract(expected);
      expect(diffDrizzleContract(contract, remoteCatalog(db)).verdict).toBe('pass');
      db.exec(`DROP INDEX idx_users_username; ${replacement}`);
      for (const actual of [inspectDatabase(db), remoteCatalog(db, true)]) {
        expect(compareDatabaseSchemas(expected, actual).verdict).toBe('fail');
        expect(diffDrizzleContract(contract, actual).verdict).toBe('fail');
      }
    } finally { db.close(); }
  });

  it.each(['index_sql', 'index_sql_is_null', 'column_name', 'column_name_is_null', 'coll', 'desc', 'key', 'cid', 'seqno', 'origin', 'unique', 'partial'])('fails closed when remote index %s metadata is absent', field => {
    const db = replayMigrations();
    try {
      expect(() => remoteCatalog(db, false, rows => rows.map(row => {
        if (row.index_name !== 'idx_users_username' && row.name !== 'idx_users_username') return row;
        const copy = { ...row }; delete copy[field]; return copy;
      }))).toThrow(/Index .*metadata/);
    } finally { db.close(); }
  });

  it.each([
    { index_sql_is_null: 2 }, { column_name_is_null: 'false' },
    { index_sql_is_null: 1 }, { column_name_is_null: 1 },
    { index_sql_is_null: 0, index_sql: null }, { column_name_is_null: 0, column_name: null },
    { index_sql_is_null: 1, index_sql: undefined }, { column_name_is_null: 1, column_name: undefined },
  ])('rejects malformed or contradictory remote index null metadata: %j', change => {
    const db = replayMigrations();
    try {
      expect(() => remoteCatalog(db, false, rows => rows.map(row =>
        row.index_name === 'idx_users_username' && Number(row.key) === 1 ? { ...row, ...change } : row))).toThrow(/Index .*metadata/);
    } finally { db.close(); }
  });

  it('rejects distinct Unicode expression indexes whose insertion behavior differs', () => {
    const baseline = new DatabaseSync(':memory:');
    const changed = new DatabaseSync(':memory:');
    try {
      baseline.exec('CREATE TABLE t("Ä" TEXT,"ä" TEXT); CREATE UNIQUE INDEX ix ON t(lower(Ä))');
      changed.exec('CREATE TABLE t("Ä" TEXT,"ä" TEXT); CREATE UNIQUE INDEX ix ON t(lower(ä))');
      baseline.exec("INSERT INTO t VALUES ('ONE','same')");
      changed.exec("INSERT INTO t VALUES ('ONE','same')");
      expect(() => baseline.exec("INSERT INTO t VALUES ('TWO','same')")).not.toThrow();
      expect(() => changed.exec("INSERT INTO t VALUES ('TWO','same')")).toThrow(/UNIQUE/);
      const expected = inspectDatabase(baseline);
      for (const actual of [inspectDatabase(changed), remoteCatalog(changed)]) {
        expect.soft(compareDatabaseSchemas(expected, actual).verdict).toBe('fail');
        expect.soft(diffDrizzleContract(buildCatalogContract(expected), actual).verdict).toBe('fail');
      }
    } finally { baseline.close(); changed.close(); }
  });

  it.each([
    ['lower(Ä)', 'LOWER(Ä)', 'pass'],
    ['lower("Ä")', 'lower("ä")', 'fail'],
    ["lower('Ä')", "lower('ä')", 'fail'],
    ["lower('Keep  Case')", "lower('keep Case')", 'fail'],
  ])('preserves Unicode and quoted tokens while accepting ASCII spelling: %s / %s', (left, right, verdict) => {
    const table = 'CREATE TABLE t("Ä" TEXT,"ä" TEXT);';
    const expected = catalog(`${table} CREATE INDEX ix ON t(${left})`);
    for (const remote of [false, true]) {
      const actual = catalog(`${table} CREATE INDEX ix ON t(${right})`, remote);
      expect(compareDatabaseSchemas(expected, actual).verdict).toBe(verdict);
      expect(diffDrizzleContract(buildCatalogContract(expected), actual).verdict).toBe(verdict);
    }
  });

  it('fails closed when an index has no key rows or no SQL definition', () => {
    const db = replayMigrations();
    try {
      expect(() => remoteCatalog(db, false, rows => rows.filter(row => row.index_name !== 'idx_users_username'))).toThrow(/Index .*metadata/);
      expect(() => remoteCatalog(db, false, rows => rows.map(row => row.index_name === 'idx_users_username' ? { ...row, index_sql: null } : row))).toThrow(/Index .*metadata/);
    } finally { db.close(); }
  });

  it('preserves index expressions and quoted contents while accepting provider SQL layout', () => {
    const table = 'CREATE TABLE t(a TEXT, b INTEGER);';
    const expected = catalog(table + "CREATE INDEX ix ON t(substr(a, 1, 2) COLLATE NOCASE DESC, b) WHERE a <> 'Keep  Case'");
    expect(compareDatabaseSchemas(expected, catalog(table + "create index ix on t( substr ( a,1,2 ) collate nocase desc,b ) where a<>'Keep  Case'", true)).verdict).toBe('pass');
    for (const expression of ["substr(a, 1, 3)", "substr(a, 2, 2)"]) {
      const changed = catalog(table + `CREATE INDEX ix ON t(${expression} COLLATE NOCASE DESC, b) WHERE a <> 'Keep  Case'`, true);
      expect(compareDatabaseSchemas(expected, changed).verdict).toBe('fail');
      expect(diffDrizzleContract(buildCatalogContract(expected), changed).verdict).toBe('fail');
    }
    expect(compareDatabaseSchemas(expected, catalog(table + "CREATE INDEX ix ON t(substr(a, 1, 2) COLLATE NOCASE DESC, b) WHERE a <> 'keep Case'", true)).verdict).toBe('fail');
  });

  it('retains implicit unique and WITHOUT ROWID primary-key index semantics', () => {
    const sql = 'CREATE TABLE t(a TEXT COLLATE NOCASE, b TEXT, PRIMARY KEY(a DESC,b), UNIQUE(b)) WITHOUT ROWID';
    const expected = catalog(sql);
    expect(compareDatabaseSchemas(expected, catalog(sql, true)).verdict).toBe('pass');
    expect(expected.tables.t.indexes.every(index => index.sql === null)).toBe(true);
    for (const changed of [sql.replace('NOCASE', 'BINARY'), sql.replace('a DESC', 'a ASC')]) {
      expect(diffDrizzleContract(buildCatalogContract(expected), catalog(changed, true)).verdict).toBe('fail');
    }
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

describe.skipIf(process.platform === 'win32')('direct schema CLI with real SQLite queries and Wrangler index-null transport', () => {
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
    ['index NOCASE drift', 'DROP INDEX idx_users_username; CREATE UNIQUE INDEX idx_users_username ON users(username COLLATE NOCASE)', 'fail'],
    ['index DESC drift', 'DROP INDEX idx_users_username; CREATE UNIQUE INDEX idx_users_username ON users(username DESC)', 'fail'],
    ['index expression drift', 'DROP INDEX idx_users_username; CREATE UNIQUE INDEX idx_users_username ON users(lower(username))', 'fail'],
    ['index predicate drift', "DROP INDEX idx_users_username; CREATE UNIQUE INDEX idx_users_username ON users(username) WHERE username <> ''", 'fail'],
    ['index uniqueness drift', 'DROP INDEX idx_users_username; CREATE INDEX idx_users_username ON users(username)', 'fail'],
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
    // Only the subprocess transport is replaced. SQL executes as received against
    // the replay; index SQL NULLs use Wrangler's observed string-null encoding.
    writeFileSync(stub, `#!${process.execPath}
const {DatabaseSync}=require('node:sqlite');
const args=process.argv.slice(2);
if(args.includes('info')){console.log(JSON.stringify({name:'fixture-db',uuid:'${databaseId}'}));process.exit(0);}
const sql=args[args.indexOf('--command')+1];
const db=new DatabaseSync(${JSON.stringify(file)},{readOnly:true});
try{console.log(JSON.stringify(sql.split(';').map(s=>s.trim()).filter(Boolean).map(s=>({results:db.prepare(s).all().map(row=>Object.fromEntries(Object.entries(row).map(([key,value])=>[key,['index_sql','column_name'].includes(key)&&value===null?'null':value])))}))));}finally{db.close();}
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
