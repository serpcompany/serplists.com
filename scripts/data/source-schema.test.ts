import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { replayMigrations, listMigrationFiles, normalizeSql } from './schema-contract';
import { inspectSourceSchema, SOURCE_CATALOG_SQL } from './source-schema';
import { assertSourceSchemaProof } from './source-schema-proof.mjs';
import { digest, prepareProduction, approvalToken } from './production-preparation-lib.mjs';
import { runProductionDataPhase } from './production-executor-lib.mjs';
import { captureRemoteInvariantSnapshot } from './invariant-capture-lib.mjs';

const commit = 'a'.repeat(40);
const database = { databaseName: 'local-only', databaseId: 'local-only-id' };
const history = listMigrationFiles().map(m => m.name);
const migration = history.at(-1)!;
function fixture(current = false) {
  const db = replayMigrations({ through: current ? migration : history.at(-2) });
  const appliedMigrations = current ? history : history.slice(0, -1);
  db.exec('CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)');
  appliedMigrations.forEach((name, i) => db.prepare('INSERT INTO d1_migrations(id,name) VALUES (?,?)').run(i + 1, name));
  const binding = { commit, database, appliedMigrations, pendingMigrations: current ? [] : [migration], ledgerSha256: digest(appliedMigrations) };
  const queries: string[] = [];
  const inspect = () => inspectSourceSchema({ ...binding, execute: (sql: string) => {
    queries.push(sql);
    expect(sql).toMatch(/^SELECT /);
    return JSON.stringify([{ results: db.prepare(sql).all() }]);
  } });
  return { db, binding, inspect, queries };
}

describe('exact source catalog before writes', () => {
  it('ignores transport-stripped SQL comments while preserving quoted tokens and literal comment markers', () => {
    expect(normalizeSql("CREATE/**/TABLE t(x TEXT /* 'comment' */ DEFAULT '-- literal /* retained */');", true)).toBe(normalizeSql("CREATE TABLE t(x TEXT DEFAULT '-- literal /* retained */');", true));
    expect(normalizeSql("SELECT 'it''s -- retained', \"/* retained */\" -- don't treat the quote as SQL\n FROM [table--name]", true)).toBe(normalizeSql("SELECT 'it''s -- retained', \"/* retained */\" FROM [table--name]", true));
    expect(normalizeSql("SELECT 'a--b'", true)).not.toBe(normalizeSql("SELECT 'ab'", true));
    expect(() => normalizeSql('SELECT 1 /* unterminated', true)).toThrow('Unterminated SQL comment.');
  });
  it.each([{ rows: null }, { rows: {} }, { rows: [null] }, { rows: [[]] }, { rows: [{ type: 'table', name: 'fixture', tbl_name: 'fixture', sql: 42 }] }])('rejects malformed catalog transport rows without trusting a cast (%j)', ({ rows }) => {
    const f = fixture();
    try {
      expect(() => inspectSourceSchema({ ...f.binding, execute: sql => JSON.stringify([{ results: sql === SOURCE_CATALOG_SQL ? rows : f.db.prepare(sql).all() }]) })).toThrow('Production source catalog verification failed before migration writes.');
    } finally { f.db.close(); }
  });
  it.each([false, true])('accepts correct applied prefix (current=%s) without demanding candidate columns early', current => {
    const f = fixture(current);
    try {
      const proof = f.inspect();
      assertSourceSchemaProof(proof, f.binding);
      expect(proof.appliedThrough).toBe(current ? migration : history.at(-2));
      if (!current) {
        f.db.exec(readFileSync(new URL(`../../db/migrations/${migration}`, import.meta.url), 'utf8'));
        f.db.prepare('INSERT INTO d1_migrations(id,name) VALUES (?,?)').run(history.length, migration);
        expect(inspectSourceSchema({ ...f.binding, pendingMigrations: [], execute: (sql: string) => JSON.stringify([{ results: f.db.prepare(sql).all() }]) }).verdict).toBe('pass');
      }
    } finally { f.db.close(); }
  });

  it.each([
    ['column/default', "ALTER TABLE templates ADD COLUMN drift TEXT DEFAULT 'private-sentinel@example.test'"],
    ['constraint', "ALTER TABLE templates ADD COLUMN drift INTEGER CHECK(drift > 0)"],
    ['existing-column constraint', "PRAGMA writable_schema=ON; UPDATE sqlite_schema SET sql=replace(sql, 'title TEXT NOT NULL', 'title TEXT NOT NULL CHECK(length(title)>0)') WHERE type='table' AND name='templates'; PRAGMA writable_schema=OFF"],
    ['changed index expression', 'DROP INDEX idx_templates_user_id; CREATE INDEX idx_templates_user_id ON templates(lower(user_id))'],
    ['index', 'CREATE INDEX drift ON templates(title)'],
    ['view', 'CREATE VIEW drift AS SELECT title FROM templates'],
    ['table', 'CREATE TABLE drift(id INTEGER PRIMARY KEY)'],
    ['platform-looking application table', 'CREATE TABLE _cf_unreviewed(id INTEGER PRIMARY KEY)'],
    ['trigger', 'CREATE TRIGGER drift AFTER UPDATE ON templates BEGIN DELETE FROM checklist_runs WHERE user_id=NEW.user_id; END'],
    ['missing index', 'DROP INDEX idx_templates_user_id'],
  ])('rejects %s drift with safe diagnostics and zero writes', (_name, sql) => {
    const f = fixture();
    try {
      f.db.exec(sql);
      const before = f.db.prepare('SELECT total_changes() AS n').get();
      expect(f.inspect).toThrow('Production source catalog verification failed before migration writes.');
      expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(before);
    } finally { f.db.close(); }
  });

  it.each(['prepare', 'after-approval'])('actual 0024 trigger deletion is rejected at %s with zero migration writes', phase => {
    const f = fixture();
    try {
      f.db.exec(readFileSync(new URL('./fixtures/production-export-edge-cases.sql', import.meta.url), 'utf8'));
      const request = { ...f.binding };
      let writes = 0;
      const run = (step: string) => {
        if (step === 'source-schema') return { verdict: 'pass', summary: f.inspect() };
        if (step === 'pre-invariants') {
          const snapshot = captureRemoteInvariantSnapshot({ database: database.databaseName, key: 'local-source-schema-invariant-key-000000', runWrangler: (args: string[]) => {
            const sql = args.includes('--file') ? readFileSync(args[args.indexOf('--file') + 1], 'utf8') : args[args.indexOf('--command') + 1];
            return JSON.stringify(sql.split(';').map(statement => statement.replace(/^\s*--.*$/gm, '').trim()).filter(Boolean)
              .map(statement => ({ results: f.db.prepare(statement).all() })));
          } });
          expect(snapshot.ledgerSha256).toBe(f.binding.ledgerSha256);
          return { verdict: 'pass', summary: snapshot };
        }
        if (step === 'migration-apply') { writes++; f.db.exec(readFileSync(new URL(`../../db/migrations/${migration}`, import.meta.url), 'utf8')); }
        return { verdict: 'pass', summary: { type: step } };
      };
      const drift = () => f.db.exec('CREATE TRIGGER drift AFTER UPDATE ON templates BEGIN DELETE FROM checklist_runs WHERE user_id=NEW.user_id; END');
      if (phase === 'prepare') drift();
      const before = f.db.prepare('SELECT count(*) AS n FROM checklist_runs').get();
      expect(before?.n).toBe(2);
      const changes = f.db.prepare('SELECT total_changes() AS n').get();
      const prepare = () => prepareProduction({ request, context: { commit }, run });
      if (phase === 'prepare') expect(prepare).toThrow(/source catalog/);
      else {
        const preparation = prepare();
        const receipt = { preparationSha256: digest(preparation), runId: '1', runAttempt: '1', artifactId: '1' };
        const approval = { recovery: receipt, recoveryTokenSha256: digest(approvalToken(receipt)) };
        drift();
        expect(() => runProductionDataPhase({ ...f.binding, preparation, receipt, approval, run })).toThrow(/source catalog/);
      }
      expect(writes).toBe(0);
      expect(f.db.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
      expect(f.db.prepare('SELECT count(*) AS n FROM checklist_runs').get()).toEqual(before);
    } finally { f.db.close(); }
  });

  it('rejects proof rebinding and source proof types used as candidate proof', () => {
    const f = fixture();
    try {
      const proof = f.inspect();
      for (const change of [{ commit: 'b'.repeat(40) }, { database: { ...database, databaseId: 'other' } }, { pendingMigrations: [] }, { ledgerSha256: 'b'.repeat(64) }]) {
        expect(() => assertSourceSchemaProof(proof, { ...f.binding, ...change })).toThrow();
      }
      expect(proof.type).toBe('source-schema');
      expect(() => assertSourceSchemaProof({ ...proof, type: 'schema-contract' }, f.binding)).toThrow();
    } finally { f.db.close(); }
  });
});
