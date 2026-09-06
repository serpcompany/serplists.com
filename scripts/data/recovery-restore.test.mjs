import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureFullRecoveryState, prepareRecoveryExport, withPreparedRecoveryImport } from "./recovery-restore-lib.mjs";
import { syntheticSourceDatabase } from "./sanitizer-test-source.mjs";

// Exact supported dump shape emitted by installed Miniflare dumpSql: table/data
// interleaving in sqlite_schema rowid order, sequence last, then schema objects.
const dump = `PRAGMA defer_foreign_keys=TRUE;
/* account created in 0008, users rebuilt in 0016; do not split this comment */
CREATE TABLE IF NOT EXISTS "account"(id TEXT PRIMARY KEY, user_id TEXT REFERENCES users(id), value TEXT);
INSERT INTO "account" VALUES('a','u',replace('literal; -- /* it''s */\\n','\\n',char(10)));
CREATE TABLE "d1_migrations"(id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TEXT);
INSERT INTO "d1_migrations" VALUES(1,'0008_better_auth_tables.sql','2024-01-01');
INSERT INTO "d1_migrations" VALUES(2,'0016_users.sql','2024-01-02');
CREATE TABLE "users"(id TEXT PRIMARY KEY);
INSERT INTO "users" VALUES('u');
CREATE TABLE "probe"(id INTEGER PRIMARY KEY, value TEXT, payload BLOB);
INSERT INTO "probe" VALUES(1,'untouched;value',X'00ff');
DELETE FROM sqlite_sequence;
INSERT INTO "sqlite_sequence" VALUES('d1_migrations',19);
CREATE UNIQUE INDEX "account_value" ON "account"(value);
CREATE TRIGGER "account_insert" AFTER INSERT ON account BEGIN
  -- END; is only a comment
  UPDATE probe SET value = CASE WHEN NEW.id = 'x;y' THEN CASE WHEN 1 THEN 'yes;END' END ELSE 'no;--' END;
  INSERT INTO probe VALUES(2, 'trigger; fired', NULL);
END;
CREATE VIEW "probe_view" AS SELECT value FROM probe;
-- trailing comment without newline`;
const key = "synthetic-issue120-equality-key-12345";
function state(db) {
  return captureFullRecoveryState({ key, query: sql => JSON.stringify([{ success: true, meta: { duration: 0 }, results: db.prepare(sql).all() }]) });
}
function restored(sql) {
  const db = new DatabaseSync(":memory:");
  try { db.exec("PRAGMA foreign_keys=ON; BEGIN;"); db.exec(sql); db.exec("COMMIT;"); return db; }
  catch (error) { db.close(); throw error; }
}

describe("actual-export recovery preparation", () => {
  it.each(['catalog', 'columns', 'values', 'foreign-keys', 'integrity'])('rejects invalid %s query envelopes before recovery proof', stage => {
    const db = syntheticSourceDatabase(new URL('../..', import.meta.url).pathname, true);
    const matches = sql => stage === 'catalog' ? sql.includes('FROM sqlite_master')
      : stage === 'columns' ? sql.startsWith('PRAGMA table_xinfo')
      : stage === 'values' ? sql.startsWith('SELECT typeof(')
      : stage === 'foreign-keys' ? sql === 'PRAGMA foreign_key_check' : sql === 'PRAGMA quick_check';
    try {
      for (const corrupt of [
        entries => { entries[0].success = false; },
        entries => { delete entries[0].success; },
        entries => { entries[0].errors = ['PRIVATE_RECOVERY_ERROR']; },
        entries => { entries[0].error = null; },
        entries => { entries[0].meta = []; },
        entries => { entries.push({ success: false, meta: {}, results: [] }); },
        entries => { entries.push({ success: true, meta: {}, results: [] }); },
        'duplicate',
      ]) {
        let poisoned = false;
        expect(() => captureFullRecoveryState({ key, query: sql => {
          expect(poisoned).toBe(false);
          const entries = [{ success: true, meta: { duration: 0 }, results: db.prepare(sql).all() }];
          if (matches(sql)) { poisoned = true; if (typeof corrupt === 'function') corrupt(entries); }
          const output = JSON.stringify(entries);
          return poisoned && corrupt === 'duplicate' ? output.replace('"success":true', '"success":false,"success":true') : output;
        } })).toThrow(/Recovery/);
        expect(poisoned).toBe(true);
      }
    } finally { db.close(); }
  });
  it.each([false, true])("supports the repository's complete pre/post0024 catalog (SQLite unit coverage, current=%s)", current => {
    const source = syntheticSourceDatabase(new URL("../..", import.meta.url).pathname, current);
    let target;
    try {
      // Model the installed dumpSql ordering, not a successful test-only restore
      // order. Actual Wrangler export/import is separately required by the real
      // local D1 test; this unit test cannot substitute for workerd evidence.
      const entries = ["PRAGMA defer_foreign_keys=TRUE;"];
      const id = value => '"' + value.replaceAll('"', '""') + '"';
      for (const table of source.prepare("SELECT name, sql FROM sqlite_master WHERE type='table' ORDER BY name='sqlite_sequence', rowid").all()) {
        entries.push(table.name === "sqlite_sequence" ? "DELETE FROM sqlite_sequence;" : table.sql + ";");
        const columns = source.prepare(`PRAGMA table_info(${id(table.name)})`).all();
        const values = source.prepare(`SELECT ${columns.map((col, i) => `quote(${id(col.name)}) AS c${i}`).join(",")} FROM ${id(table.name)}`).all();
        for (const row of values) entries.push(`INSERT INTO ${id(table.name)} VALUES(${Object.values(row).join(",")});`);
      }
      for (const object of source.prepare("SELECT sql FROM sqlite_master WHERE sql IS NOT NULL AND type IN ('index','trigger','view') ORDER BY type COLLATE NOCASE").all()) entries.push(object.sql + ";");
      const exported = entries.join("\n");
      expect(() => restored(exported)).toThrow(/no such table.*users/);
      target = restored(prepareRecoveryExport(exported).sql);
      expect(state(target)).toEqual(state(source));
    } finally { source.close(); target?.close(); }
  });

  it("full equality detects embedded NUL text and exact large integers", () => {
    const db = new DatabaseSync(":memory:");
    try {
      db.exec("CREATE TABLE values_probe(value TEXT, large INTEGER); INSERT INTO values_probe VALUES('a' || char(0) || 'b',9223372036854775807);");
      const original = state(db);
      db.exec("UPDATE values_probe SET value='a' || char(0) || 'c';");
      expect(state(db).dataSha256).not.toBe(original.dataSha256);
      const changed = state(db);
      db.exec("UPDATE values_probe SET large=9223372036854775806;");
      expect(state(db).dataSha256).not.toBe(changed.dataSha256);
    } finally { db.close(); }
  });
  it("reproduces account/users failure and preserves complete data/catalog/ledger with deferred references", () => {
    expect(() => restored(dump)).toThrow(/no such table.*users/);
    const prepared = prepareRecoveryExport(dump);
    expect(prepared.sql.indexOf('CREATE TABLE "users"')).toBeLessThan(prepared.sql.indexOf('INSERT INTO "account"'));
    expect(prepared.sql).toContain(dump.slice(dump.indexOf('CREATE TRIGGER')));
    const db = restored(prepared.sql);
    try {
      expect(db.prepare("SELECT value FROM probe").get().value).toBe("untouched;value");
      expect(db.prepare("SELECT value FROM account").get().value).toBe("literal; -- /* it's */\n");
      expect(db.prepare("SELECT seq FROM sqlite_sequence").get().seq).toBe(19);
      expect(db.prepare("PRAGMA foreign_keys").get().foreign_keys).toBe(1);
      const snapshot = state(db);
      const second = restored(prepareRecoveryExport(prepared.sql).sql);
      try { expect(state(second)).toEqual(snapshot); } finally { second.close(); }
      db.exec("UPDATE d1_migrations SET applied_at='changed'");
      expect(state(db).dataSha256).not.toBe(snapshot.dataSha256);
      db.exec("DROP TRIGGER account_insert");
      expect(state(db).catalogSha256).not.toBe(snapshot.catalogSha256);
    } finally { db.close(); }
  });

  it("keeps every statement byte and records the original ordinal permutation", () => {
    const prepared = prepareRecoveryExport(dump);
    expect(prepared.metadata.statementCount).toBe(15);
    expect(prepared.metadata.sourceOrdinals).toEqual([0,1,3,6,8,2,4,5,7,9,10,11,12,13,14]);
    expect(prepared.metadata.sourceSha256).not.toBe(prepared.metadata.preparedSha256);
    expect(prepared.sql).toContain("/* account created in 0008, users rebuilt in 0016; do not split this comment */");
  });

  it("supports quoted identifier semicolons and doubled quotes without changing them", () => {
    const sql = `PRAGMA defer_foreign_keys=TRUE; CREATE TABLE "a;""b"("c;d" TEXT); INSERT INTO "a;""b" VALUES('a;''b');`;
    const db = restored(prepareRecoveryExport(sql).sql);
    try { expect(db.prepare('SELECT * FROM "a;""b"').get()['c;d']).toBe("a;'b"); } finally { db.close(); }
  });

  it.each([
    dump.replace("defer_foreign_keys=TRUE", "foreign_keys=OFF"),
    dump + "\nPRAGMA foreign_keys=OFF;",
    dump + "\nBEGIN;",
    dump + "\nATTACH 'file.db' AS extra;",
    dump + "\nANALYZE sqlite_schema;",
    dump + "\nCREATE VIRTUAL TABLE f USING fts5(content);",
    dump + "\nINSERT INTO users VALUES('late');",
    dump.replace("VALUES('u')", "SELECT 'u'"),
    dump.replace("VALUES('u')", "VALUES(load_extension('bad'))"),
    dump.replace("VALUES('u')", "VALUES('u') RETURNING *"),
    dump.replace("VALUES('u')", "VALUES('missing')"),
    dump + "\n/* unterminated",
    dump + "\n/* nested /* comment */",
    dump + "\nSELECT 'unterminated;",
    dump.replace("END;\nCREATE VIEW", "END\nCREATE VIEW"),
    dump + "\nCREATE TABLE extra AS SELECT 1;",
    Buffer.from([0xff, 0xfe]),
  ])("rejects unsupported or ambiguous input without echoing SQL", sql => {
    expect(() => prepareRecoveryExport(sql)).toThrow("Unsupported or ambiguous D1 full export; restore refused.");
  });

  it("binds prepared bytes to original digest and cleans private files on success and failure", () => {
    const dir = mkdtempSync(path.join(tmpdir(), "restore-unit-"));
    const inputPath = path.join(dir, "original.sql");
    writeFileSync(inputPath, dump);
    const prepared = prepareRecoveryExport(dump);
    try {
      for (const fail of [false, true]) {
        let importFile;
        const run = () => withPreparedRecoveryImport({ inputPath, expectedSourceSha256: prepared.metadata.sourceSha256,
          execute: file => {
            importFile = file;
            expect(statSync(file).mode & 0o777).toBe(0o600);
            expect(readFileSync(file, "utf8")).toBe(prepared.sql);
            if (fail) throw new Error("fixture failure");
            return "ok";
          },
        });
        if (fail) expect(run).toThrow("fixture failure"); else expect(run().metadata).toEqual(prepared.metadata);
        expect(importFile).toBeTruthy();
        expect(readdirSync(dir)).toEqual(["original.sql"]);
      }
      writeFileSync(inputPath, dump + "\n");
      expect(() => withPreparedRecoveryImport({ inputPath, expectedSourceSha256: prepared.metadata.sourceSha256, execute: () => { throw new Error("must not execute"); } })).toThrow(/digest changed/);
    } finally { rmSync(dir, { recursive: true, force: true }); }
  });
});
