import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { replayMigrations, listMigrationFiles } from "./schema-contract.ts";
import { validRetiredChecklistContent } from "../../src/lib/schemas/legacyChecklistSchema.ts";
import {
  parseAppliedMigrationLedger,
  parseInvariantOutput,
  compareMigrationLedger,
  compareDomainSnapshots,
  compareProductionInvariants,
  captureRemoteInvariantSnapshot,
  privacySafeDomainSnapshot,
  selectInvariantSqlFiles,
} from "./invariant-capture-lib.mjs";

function queryNames(database, sql) {
  return sql
    .split(";")
    .map((statement) => statement.replace(/^\s*--.*$/gm, "").trim())
    .filter(Boolean)
    .flatMap((statement) => database.prepare(statement).all())
    .map((row) => row.invariant);
}

const ledgerRows = (...names) => names.map((name, index) => ({ id: index + 1, name }));

const evolutionMigration = "0024_safe_template_evolution.sql";
function retiredFixtureDatabase(through) {
  const database = replayMigrations(through ? { through } : {});
  database.exec(`
    INSERT INTO users (id,email,password_hash,created_at) VALUES ('owner150-user','owner150@example.invalid','synthetic','2026-01-01');
    INSERT INTO templates (id,user_id,title,items,created_at) VALUES ('owner150-template','owner150-user','Synthetic template','[]','2026-01-01');
    INSERT INTO checklist_runs (id,user_id,template_id,title,items,started_at,created_at)
      VALUES ('owner150-run','owner150-user','owner150-template','Synthetic run','[]','2026-01-01','2026-01-01');
  `);
  return database;
}

function captureLocal(database, through, transport = (output) => output) {
  const migrations = listMigrationFiles().map(({ name }) => name);
  const applied = through ? migrations.slice(0, migrations.indexOf(through) + 1) : migrations;
  return captureRemoteInvariantSnapshot({
    database: "owner150-in-memory-only",
    key: "owner150-synthetic-hmac-key-1234567890",
    runWrangler: (args) => {
      const command = args.find(arg => arg.startsWith('--command='))?.slice('--command='.length)
        ?? (args.includes("--command") ? args[args.indexOf("--command") + 1] : null);
      if (command === "SELECT id, name FROM d1_migrations ORDER BY id") {
        return transport(JSON.stringify([{ success: true, meta: { duration: 0 }, results: ledgerRows(...applied) }]), command);
      }
      const sql = command ?? readFileSync(args[args.indexOf("--file") + 1], "utf8");
      return transport(JSON.stringify(sql.split(";").map((part) => part.replace(/^\s*--.*$/gm, "").trim())
        .filter(Boolean).map((statement) => ({ success: true, meta: { duration: 0 }, results: database.prepare(statement).all().map(row =>
          Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "null" : value]))) }))), sql);
    },
  });
}

function compareCaptured(pre, post) {
  return compareProductionInvariants({
    pre: pre.invariants, post: post.invariants, preDomain: pre.domain, postDomain: post.domain,
    preHasEvolution: pre.hasEvolution, postHasEvolution: post.hasEvolution,
  });
}

function writeRetired(database, entries) {
  database.prepare("UPDATE checklist_runs SET retired_items = ? WHERE id = 'owner150-run'").run(JSON.stringify(entries));
}

describe("Wrangler capture result envelopes", () => {
  const families = [
    ["ledger", sql => sql.includes('FROM d1_migrations')],
    ["aggregate", sql => sql.includes('pragma_foreign_key_check')],
    ["evolution aggregate", sql => sql.includes('templates_invalid_content_version')],
    ["ownership", sql => sql.includes("SELECT 'template' kind")],
    ["template metadata", sql => sql.includes("pragma_table_xinfo('templates')")],
    ["run metadata", sql => sql.includes("pragma_table_xinfo('checklist_runs')")],
    ["template rows", sql => sql.endsWith('AS typed_row FROM "templates" ORDER BY "id"')],
    ["run rows", sql => sql.endsWith('AS typed_row FROM "checklist_runs" ORDER BY "id"')],
  ];
  const corruptions = [
    ["false", entries => { entries[0].success = false; }],
    ["conflicting error", entries => { entries[0].error = 'private-provider-error'; }],
    ["conflicting errors", entries => { entries[0].errors = [{message:'private-provider-error'}]; }],
    ["missing success", entries => { delete entries[0].success; }],
    ["string success", entries => { entries[0].success = 'true'; }],
    ["malformed errors", entries => { entries[0].errors = {}; }],
    ["malformed metadata", entries => { entries[0].meta = []; }],
    ["null row", entries => { entries[0].results = [null]; }],
    ["array row", entries => { entries[0].results = [[]]; }],
    ["missing results", entries => { delete entries[0].results; }],
    ["non-array results", entries => { entries[0].results = {}; }],
    ["error-only suffix", entries => { entries.push({error:'private-provider-error'}); }],
    ["null suffix", entries => { entries.push(null); }],
  ];
  it('accepts pinned local metadata and remote query metadata without exposing it', () => {
    const database = retiredFixtureDatabase();
    try {
      const local = captureLocal(database);
      const remote = captureLocal(database, undefined, output => JSON.stringify(JSON.parse(output).map(entry => ({
        ...entry, errors: [], meta: {duration: 0.25, rows_read: 1, rows_written: 0, served_by: 'private-provider'},
      }))));
      expect(compareCaptured(local, remote).verdict).toBe('pass');
      expect(JSON.stringify(remote)).not.toContain('private-provider');
    } finally { database.close(); }
  });
  it.each(families.flatMap(([family, matches]) => corruptions.map(([label, corrupt]) => [family, label, matches, corrupt])))
  ("rejects %s %s before capture/comparison can pass", (_family, _label, matches, corrupt) => {
    const database = retiredFixtureDatabase();
    try {
      const before = captureLocal(database);
      let reached = false;
      let report;
      expect(() => {
        const after = captureLocal(database, undefined, (output, sql) => {
          if (!matches(sql)) return output;
          reached = true;
          const entries = JSON.parse(output);
          corrupt(entries);
          return JSON.stringify(entries);
        });
        report = compareCaptured(before, after);
      }).toThrow(/result|envelope/i);
      expect(reached).toBe(true);
      expect(report).toBeUndefined();
      try { captureLocal(database, undefined, (output, sql) => {
        if (!matches(sql)) return output;
        const entries = JSON.parse(output); corrupt(entries); return JSON.stringify(entries);
      }); } catch (error) { expect(error.message).not.toMatch(/private-provider|owner150-/); }
    } finally { database.close(); }
  });
});

describe("raw source 0024 compatibility evidence", () => {
  it.each([["templates", "items"], ["checklist_runs", "items"], ["checklist_runs", "retired_items"]])
  ("preserves exact BLOB JSON bytes and storage in %s.%s", (table, column) => {
    const database = retiredFixtureDatabase();
    try {
      for (const deleted of [false, true]) {
        database.exec(`UPDATE ${table} SET deleted_at=${deleted ? "'2026-01-02'" : "NULL"}`);
        const write = value => database.prepare(`UPDATE ${table} SET ${column}=?`).run(value);
        const raw = '[{"note":"private-one"}]';
        write(Buffer.from(raw));
        const before = captureLocal(database);
        const changes = database.prepare('SELECT total_changes() AS n').get();
        expect(compareCaptured(before, captureLocal(database)).verdict).toBe("pass");
        expect(database.prepare('SELECT total_changes() AS n').get()).toEqual(changes);
        for (const value of [Buffer.from(raw.replace('one', 'two')), Buffer.from(raw + ' '), raw]) {
          write(value);
          const after = captureLocal(database);
          expect(after.invariants).toEqual(before.invariants);
          expect(compareCaptured(before, after).verdict).toBe("fail");
          expect(JSON.stringify({before, after})).not.toMatch(/private-|owner150-|70726976617465/);
        }
      }
    } finally { database.close(); }
  });

  it("does not collapse distinct SQLite REAL values during row serialization", () => {
    const database = retiredFixtureDatabase();
    try {
      database.exec("UPDATE checklist_runs SET progress=1.0000000000000002");
      const before = captureLocal(database);
      database.exec("UPDATE checklist_runs SET progress=1.0000000000000004");
      const after = captureLocal(database);
      expect(after.invariants).toEqual(before.invariants);
      expect(compareCaptured(before, after).verdict).toBe("fail");
    } finally { database.close(); }
  });

  it("preserves SQL NULL and literal text null through the pinned local transport representation", () => {
    const database = retiredFixtureDatabase();
    try {
      database.exec("UPDATE templates SET description=NULL");
      const before = captureLocal(database);
      expect(compareCaptured(before, captureLocal(database)).verdict).toBe("pass");
      database.exec("UPDATE templates SET description='null'");
      const after = captureLocal(database);
      expect(after.invariants).toEqual(before.invariants);
      expect(compareCaptured(before, after).verdict).toBe("fail");
    } finally { database.close(); }
  });

  it("captures a standalone SQL-NULL-linked run across the immutable migration using typed rows", () => {
    const through = "0023_add_sitemap_revision_state.sql";
    const database = retiredFixtureDatabase(through);
    try {
      database.exec("UPDATE checklist_runs SET template_id=NULL");
      const pre = captureLocal(database, through);
      expect(pre.domain.runs[0].hasTemplate).toBe(false);
      database.exec(listMigrationFiles().find(({name}) => name === evolutionMigration).sql);
      const post = captureLocal(database);
      expect(post.domain.runs[0].templateVersion).toBe(1);
      expect(compareCaptured(pre, post).verdict).toBe("pass");
    } finally { database.close(); }
  });

  it.each(['{"id":1,"id":2}', 'null', '{"id":"private"}', '{"private":1e-400}'])
  ("rejects malformed typed row evidence without falling back to raw cells: %s", encoded => {
    const database = retiredFixtureDatabase();
    try {
      expect(() => captureLocal(database, undefined, (output, sql) => {
        if (!sql.endsWith('AS typed_row FROM "templates" ORDER BY "id"')) return output;
        const parsed = JSON.parse(output);
        parsed[0].results[0].typed_row = encoded;
        return JSON.stringify(parsed);
      })).toThrow(/typed source row|transport evidence/i);
    } finally { database.close(); }
  });

  it.each([['real','1e-400'], ['real','-1e-400'], ['real','1e400'], ['null','null'], ['integer','0'], ['text',null], ['blob','NOT_HEX']])
  ("rejects invalid SQLite typed cells %s %s before evidence", (type, value) => {
    const database = retiredFixtureDatabase();
    try {
      expect(() => captureLocal(database, undefined, (output, sql) => {
        if (!sql.endsWith('AS typed_row FROM "checklist_runs" ORDER BY "id"')) return output;
        const response = JSON.parse(output);
        const row = JSON.parse(response[0].results[0].typed_row);
        row.progress = [type, value];
        response[0].results[0].typed_row = JSON.stringify(row);
        return JSON.stringify(response);
      })).toThrow(/typed source row value/i);
    } finally { database.close(); }
  });

  it("preserves BLOB versus text SQLite storage types in projected content", () => {
    const database = retiredFixtureDatabase();
    try {
      database.exec("UPDATE templates SET description='null'");
      const before = captureLocal(database);
      database.exec("UPDATE templates SET description=x'6e756c6c'");
      const after = captureLocal(database);
      expect(after.invariants).toEqual(before.invariants);
      expect(compareCaptured(before, after).verdict).toBe("fail");
    } finally { database.close(); }
  });

  it.each(["templates", "checklist_runs"].flatMap(table => ["omitted", "truncated", "duplicate", "replaced", "owner", "deletion", "owner-omitted", "owner-duplicate", "owner-replaced"].map(kind => [table, kind])))
  ("rejects incomplete or inconsistent %s source rows: %s", (table, kind) => {
    for (const through of [undefined, "0023_add_sitemap_revision_state.sql"]) {
      const database = retiredFixtureDatabase(through);
      try {
        if (table === "templates") database.exec("INSERT INTO templates(id,user_id,title,items,created_at) SELECT 'private-second',user_id,title,items,created_at FROM templates");
        else database.exec("INSERT INTO checklist_runs(id,user_id,title,items,started_at,created_at) SELECT 'private-second',user_id,title,items,started_at,created_at FROM checklist_runs");
        expect(compareCaptured(captureLocal(database, through), captureLocal(database, through)).verdict).toBe("pass");
        let snapshot;
        expect(() => {
          snapshot = captureLocal(database, through, (output, sql) => {
            const response = JSON.parse(output);
            if (kind.startsWith("owner-") && sql.includes("SELECT 'template' kind")) {
              const target = table === "templates" ? "template" : "run";
              const rows = response[0].results;
              const index = rows.findIndex(row => row.kind === target);
              if (kind === "owner-omitted") rows.splice(index, 1);
              if (kind === "owner-duplicate") rows[index + 1] = rows[index];
              if (kind === "owner-replaced") rows[index].id = "private-replaced";
            } else if (sql.endsWith(`AS typed_row FROM "${table}" ORDER BY "id"`)) {
              const rows = response[0].results;
              if (kind === "omitted") response[0].results = [];
              if (kind === "truncated") rows.pop();
              if (kind === "duplicate") rows[1] = rows[0];
              if (["replaced", "owner", "deletion"].includes(kind)) {
                const row = JSON.parse(rows[1].typed_row);
                if (kind === "replaced") row.id = ["text", "private-replaced"];
                if (kind === "owner") row.user_id = ["text", "private-replaced"];
                if (kind === "deletion") row.deleted_at = ["text", "2026-01-02"];
                rows[1].typed_row = JSON.stringify(row);
              }
            }
            return JSON.stringify(response);
          });
        }).toThrow(/source row/i);
        expect(snapshot).toBeUndefined();
      } finally { database.close(); }
    }
  });

  const through = "0023_add_sitemap_revision_state.sql";
  it.each(["templates", "checklist_runs"])("blocks immutable migration collisions in every raw %s row", (table) => {
    const database = retiredFixtureDatabase(through);
    try {
      const raw = '[{"id":"private-section","items":[{"id":"legacy-item-1-2","title":"Private existing"},{"title":"Private missing"}]}]';
      if (table === "templates") database.prepare("INSERT INTO templates(id,user_id,title,items,created_at) VALUES ('private-last','owner150-user','Private',?,'2026-01-01')").run(raw);
      else database.prepare("INSERT INTO checklist_runs(id,user_id,title,items,started_at,created_at) VALUES ('private-last','owner150-user','Private',?,'2026-01-01','2026-01-01')").run(raw);
      const before = database.prepare("SELECT total_changes() AS n").get();
      expect(() => captureLocal(database, through)).toThrow("Production-shaped source is incompatible with immutable 0024 (GENERATED_ID_COLLISION).");
      expect(database.prepare("SELECT total_changes() AS n").get()).toEqual(before);
      expect(database.prepare(`SELECT items FROM ${table} WHERE id='private-last'`).get().items).toBe(raw);
      database.exec(listMigrationFiles().find(({ name }) => name === evolutionMigration).sql);
      const migrated = JSON.parse(database.prepare(`SELECT items FROM ${table} WHERE id='private-last'`).get().items);
      expect(migrated[0].items.map(item => item.id)).toEqual(["legacy-item-1-2", "legacy-item-1-2"]);
    } finally { database.close(); }
  });

  it("attests all rows and accepts opaque content IDs across actual 0024 migration and recovery comparisons", () => {
    const database = retiredFixtureDatabase(through);
    try {
      const raw = '[{"id":"section","items":[{"id":"item-one","contents":[{"id":"opaque","type":"text","text":"Private one"}]},{"id":"item-two","contents":[{"id":"opaque","type":"text","text":"Private two"}],"extension":{"id":"opaque"}}]}]';
      for (const table of ["templates", "checklist_runs"]) database.prepare(`UPDATE ${table} SET items=?`).run(raw);
      const pre = captureLocal(database, through);
      expect(pre.pre0024Compatibility).toEqual({ migration: evolutionMigration, verdict: "pass", templateCount: 1, runCount: 1, domainDigest: pre.domain.digest });
      expect(compareCaptured(pre, captureLocal(database, through)).verdict).toBe("pass");
      database.exec(listMigrationFiles().find(({ name }) => name === evolutionMigration).sql);
      const post = captureLocal(database);
      expect(compareCaptured(pre, post).verdict).toBe("pass");
      expect(compareCaptured(post, captureLocal(database)).verdict).toBe("pass");
      expect(post.pre0024Compatibility).toBeNull();
      expect(JSON.stringify({ pre, post })).not.toMatch(/Private|opaque|owner150-/);
    } finally { database.close(); }
  });
});

describe("complete foreign-key production invariants", () => {
  it.each(['"total_rows":1e-400', '"total_rows":-1e-400', '"total_rows":1,"total_rows":0'])
  ("rejects raw transport corruption before normalization: %s", (fields) => {
    const database = retiredFixtureDatabase();
    try {
      let snapshot;
      expect(() => {
        snapshot = captureLocal(database, undefined, (output, sql) => sql.includes('pragma_foreign_key_check')
          ? output.replace('"total_rows":0', fields) : output);
      }).toThrow(/invariant|duplicate/i);
      expect(snapshot).toBeUndefined();
    } finally { database.close(); }
  });

  it("requires typed zero foreign-key evidence on both sides of migration and restore comparisons", () => {
    const database = retiredFixtureDatabase();
    try {
      const healthy = captureLocal(database);
      expect(compareCaptured(healthy, healthy).verdict).toBe("pass");
      for (const value of [undefined, null, false, "0", {}, [], NaN, Infinity, -1, 0.5, 1]) {
        const changed = structuredClone(healthy);
        if (value === undefined) delete changed.invariants.foreign_key_violations;
        else changed.invariants.foreign_key_violations = value;
        for (const [pre, post] of [[healthy, changed], [changed, healthy], [changed, changed]]) {
          expect(compareCaptured(pre, post).verdict).toBe("fail");
        }
      }
      for (const value of [undefined, null, false, "0", {}, [], -1, 0.5, 1e100]) {
        const rows = [{ invariant: "users", total_rows: 1 }];
        if (value !== undefined) rows.push({ invariant: "foreign_key_violations", total_rows: value });
        expect(() => parseInvariantOutput(JSON.stringify([{ success: true, meta: { duration: 0 }, results: rows }]))).toThrow(/foreign.key/i);
      }
      expect(() => parseInvariantOutput(JSON.stringify([{ success: true, meta: { duration: 0 }, results: [
        { invariant: "foreign_key_violations", total_rows: 1 },
        { invariant: "foreign_key_violations", total_rows: 0 },
      ] }]))).toThrow(/foreign.key/i);
    } finally { database.close(); }
  });

  it.each(["history author", "run template"])("blocks existing and newly introduced dangling %s references", (relation) => {
    const database = retiredFixtureDatabase();
    try {
      const healthy = captureLocal(database);
      expect(compareCaptured(healthy, healthy).verdict).toBe("pass");
      database.exec("PRAGMA foreign_keys = OFF");
      if (relation === "history author") database.exec(`
        INSERT INTO template_versions (id,template_id,version,changed_by_user_id,subject_type,subject_id,snapshot_json,created_at)
        VALUES ('private-history','owner150-template',1,'private-missing-user','template','owner150-template','{}','2026-01-01');
      `);
      else database.exec("UPDATE checklist_runs SET template_id = 'private-missing-template'");
      for (const before of [healthy, undefined]) {
        let report;
        expect(() => {
          const captured = captureLocal(database);
          report = compareCaptured(before ?? captured, captured);
        }).toThrow(/foreign.key/i);
        expect(report).toBeUndefined();
      }
      expect(healthy.invariants.foreign_key_violations).toBe(0);
      expect(JSON.stringify(healthy)).not.toMatch(/private-|owner150-/);
    } finally { database.close(); }
  });
});

describe("unambiguous JSON production invariants", () => {
  it.each([["templates", "items"], ["checklist_runs", "items"], ["checklist_runs", "retired_items"]])(
    "preserves mathematically equivalent numeric notation in %s %s", (table, column) => {
      const database = retiredFixtureDatabase();
      try {
        for (const [canonical, tokens] of [
          ["1", ["1.0", "1e0", "10e-1", "0.1e1"]],
          ["0.5", ["5e-1", "0.50", "50E-2"]],
          ["-12.5", ["-125e-1", "-12.5000"]],
          ["0", ["0.0", "0e999999999999999999999"]],
        ]) {
          const document = (token) => column === "items"
            ? `[{"id":"private-section","items":[{"id":${token},"fileSize":${token}}]}]`
            : `[{"kind":"item","sectionId":"private-section","item":{"id":${token},"fileSize":${token}}}]`;
          database.prepare(`UPDATE ${table} SET ${column} = ?`).run(document(canonical));
          const pre = captureLocal(database);
          for (const token of tokens) {
            database.prepare(`UPDATE ${table} SET ${column} = ?`).run(document(token));
            const post = captureLocal(database);
            expect(compareCaptured(post, captureLocal(database)).verdict).toBe("pass");
            expect(compareCaptured(pre, post).verdict).toBe("pass");
            expect(post.domain.digest).toBe(pre.domain.digest);
            expect(JSON.stringify({ pre, post })).not.toMatch(/private-|owner150-/);
          }
        }
      } finally { database.close(); }
    },
  );
  const pathCases = [
    ["literal dot", (section) => { section["a.b"] = { id: "private-one" }; section.a = { b: { id: "private-two" } }; }],
    ["literal bracket", (section) => { section["a[0]"] = { id: "private-one" }; section.a = [{ id: "private-two" }]; }],
    ["numeric property", (section) => { section["a.0"] = { id: "private-one" }; section.a = { "0": { id: "private-two" } }; }],
    ["mixed bracket and dot", (section) => { section["a[0].b"] = { id: "private-one" }; section.a = [{ b: { id: "private-two" } }]; }],
  ];
  it.each(pathCases)("rejects identity swaps between %s and nested paths", (_label, populate) => {
    for (const through of [undefined, "0023_add_sitemap_revision_state.sql"]) for (const table of ["templates", "checklist_runs"]) {
      const database = retiredFixtureDatabase(through);
      try {
        const entries = [{ id: "private-section", items: [] }];
        populate(entries[0]);
        database.prepare(`UPDATE ${table} SET items = ?`).run(JSON.stringify(entries));
        const pre = captureLocal(database, through);
        expect(compareCaptured(pre, captureLocal(database, through)).verdict).toBe("pass");
        const swapped = JSON.stringify(entries).replace("private-one", "private-temp").replace("private-two", "private-one").replace("private-temp", "private-two");
        database.prepare(`UPDATE ${table} SET items = ?`).run(swapped);
        const post = captureLocal(database, through);
        expect(post.invariants).toEqual(pre.invariants);
        const comparison = compareCaptured(pre, post);
        expect(comparison.verdict).toBe("fail");
        expect(post.domain.digest).not.toBe(pre.domain.digest);
        expect(JSON.stringify({ pre, post, comparison })).not.toMatch(/private-|owner150-user|owner150-template|owner150-run/);
      } finally { database.close(); }
    }
  });

  it.each([["templates", "items"], ["checklist_runs", "items"], ["checklist_runs", "retired_items"]])(
    "rejects duplicate identities before production evidence for %s %s", (table, column) => {
      const database = retiredFixtureDatabase();
      try {
        const document = (identity) => column === "items"
          ? `[{"id":"private-section","items":[{${identity},"title":"Private title"}]}]`
          : `[{"kind":"item","sectionId":"private-section","item":{${identity},"title":"Private title"}}]`;
        database.prepare(`UPDATE ${table} SET ${column} = ?`).run(document('"id":"private-last"'));
        const healthy = captureLocal(database);
        expect(compareCaptured(healthy, captureLocal(database)).verdict).toBe("pass");
        for (const identity of [
          '"id":"private-original","id":"private-last"',
          '"id":"private-replacement","id":"private-last"',
          String.raw`"id":"private-original","\u0069d":"private-last"`,
          '"id":9007199254740993,"id":"private-last"',
          String.raw`"id":"private-last","extension":{"private-key":1,"private-\u006bey":2}`,
        ]) {
          database.prepare(`UPDATE ${table} SET ${column} = ?`).run(document(identity));
          let evidence, error;
          try { evidence = compareCaptured(healthy, captureLocal(database)); }
          catch (caught) { error = caught; }
          expect(evidence).toBeUndefined();
          expect(error?.message).toBe("Duplicate JSON object keys are unsupported.");
          expect(JSON.stringify({ healthy, evidence, error, message: error?.message, stack: error?.stack }))
            .not.toMatch(/private-|Private |9007199254740993|owner150-user|owner150-template|owner150-run/);
        }
      } finally { database.close(); }
    },
  );

  it("preserves equal decoded keys in distinct objects and insignificant JSON formatting", () => {
    const database = retiredFixtureDatabase();
    try {
      const raw = String.raw`[{"\u0069d":"private-section","items":[{"id":"private-one","notes":"Private {\"id\":1,\"id\":2}"},{"\u0069d":"private-two","notes":"Private \\ string"}]}]`;
      for (const table of ["templates", "checklist_runs"]) database.prepare(`UPDATE ${table} SET items=?`).run(raw);
      const retired = String.raw`[{"kind":"item","sectionId":"private-section","item":{"id":"private-one"}},{"kind":"item","sectionId":"private-section","item":{"\u0069d":"private-two"}}]`;
      database.prepare("UPDATE checklist_runs SET retired_items=?").run(retired);
      const pre = captureLocal(database);
      for (const table of ["templates", "checklist_runs"]) database.prepare(`UPDATE ${table} SET items=?`).run(JSON.stringify(JSON.parse(raw), null, 2));
      database.prepare("UPDATE checklist_runs SET retired_items=?").run(JSON.stringify(JSON.parse(retired), null, 2));
      const post = captureLocal(database);
      expect(compareCaptured(pre, post).verdict).toBe("pass");
      expect(pre.domain.digest).toBe(post.domain.digest);
      expect(JSON.stringify({ pre, post })).not.toMatch(/private-|Private /);
    } finally { database.close(); }
  });
});

describe("active identity production invariants", () => {
  const activeHistory = () => [{ id: "private-section", title: "Private section title", items: [{
    id: "private-item", title: "Private item title", subItems: [{ id: "private-direct", title: "Private direct title" }],
    contents: [{ id: "private-content", type: "subItems", subItems: [{ id: "private-nested", title: "Private nested title" }] }],
  }] }];
  const identityTargets = {
    section: (e) => e[0],
    item: (e) => e[0].items[0],
    subitem: (e) => e[0].items[0].subItems[0],
    content: (e) => e[0].items[0].contents[0],
    nested: (e) => e[0].items[0].contents[0].subItems[0],
  };
  const currentCases = [undefined, "0023_add_sitemap_revision_state.sql"].flatMap((through) =>
    ["templates", "checklist_runs"].flatMap((table) => Object.keys(identityTargets).map((target) => [through ?? "current", table, target, through])));
  it.each(currentCases)("preserves every identity type/value/presence at %s %s %s", (_state, table, target, through) => {
    const database = retiredFixtureDatabase(through);
    try {
      const snapshots = [undefined, null, "", "17", 17, "18", false].map((identity) => {
        const entries = activeHistory();
        const node = identityTargets[target](entries);
        if (identity === undefined) delete node.id;
        else node.id = identity;
        database.prepare(`UPDATE ${table} SET items = ?`).run(JSON.stringify(entries));
        return captureLocal(database, through);
      });
      for (const [i, pre] of snapshots.entries()) for (const [j, post] of snapshots.entries()) {
        expect(post.invariants).toEqual(pre.invariants);
        const comparison = compareCaptured(pre, post);
        expect(comparison.verdict).toBe(i === j ? "pass" : "fail");
        expect(post.domain.digest === pre.domain.digest).toBe(i === j);
        expect(JSON.stringify({ pre, post, comparison })).not.toMatch(/private-|Private |owner150-user|owner150-template|owner150-run/);
      }
    } finally { database.close(); }
  });

  it.each(["templates", "checklist_runs"])("rejects string-to-number item identity changes in %s", (table) => {
    const database = retiredFixtureDatabase();
    try {
      const entries = [{ id: "private-section", items: [{ id: "17", title: "Private same title" }] }];
      database.prepare(`UPDATE ${table} SET items = ?`).run(JSON.stringify(entries));
      const pre = captureLocal(database);
      expect(compareCaptured(pre, captureLocal(database)).verdict).toBe("pass");
      entries[0].items[0].id = 17;
      database.prepare(`UPDATE ${table} SET items = ?`).run(JSON.stringify(entries));
      const post = captureLocal(database);
      expect(post.invariants).toEqual(pre.invariants);
      expect(compareCaptured(pre, post).verdict).toBe("fail");
      expect(post.domain.digest).not.toBe(pre.domain.digest);
    } finally { database.close(); }
  });

  it.each(currentCases)("blocks lossy numeric identity capture at %s %s %s", (_state, table, target, through) => {
    const database = retiredFixtureDatabase(through);
    try {
      const entries = activeHistory();
      identityTargets[target](entries).id = "private-numeric-token";
      const raw = JSON.stringify(entries);
      database.prepare(`UPDATE ${table} SET items = ?`).run(raw.replace('"private-numeric-token"', "9007199254740992"));
      const pre = captureLocal(database, through);
      expect(compareCaptured(pre, captureLocal(database, through)).verdict).toBe("pass");
      for (const token of ["9007199254740993", "0.10000000000000001", "1e400", "1e-400", "-0"]) {
        database.prepare(`UPDATE ${table} SET items = ?`).run(raw.replace('"private-numeric-token"', token));
        let evidence;
        let caught;
        try { evidence = compareCaptured(pre, captureLocal(database, through)); }
        catch (error) { caught = error; }
        expect(evidence).toBeUndefined();
        expect(caught?.message).toBe("Active invariant capture contains an unsupported numeric value.");
        const report = JSON.stringify({ pre, evidence, error: caught, message: caught?.message, stack: caught?.stack });
        for (const secret of [token, "private-", "Private ", "owner150-user", "owner150-run", "owner150-template"]) {
          expect(report.includes(secret)).toBe(false);
        }
      }
    } finally { database.close(); }
  });

  const upgradeCases = ["templates", "checklist_runs"].flatMap((table) => [false, true].flatMap((flat) =>
    [["missing", undefined], ["null", null], ["empty", ""], ["string", "17"], ["number", 17], ["boolean", false]]
      .map(([label, identity]) => [table, flat ? "flat" : "sections", label, flat, identity])));
  it.each(upgradeCases)("allows exactly the real 0024 identity transition for %s %s %s", (table, _shape, _label, flat, identity) => {
    const through = "0023_add_sitemap_revision_state.sql";
    const database = retiredFixtureDatabase(through);
    try {
      const entries = activeHistory();
      entries[0].id = null;
      if (identity === undefined) delete entries[0].items[0].id;
      else entries[0].items[0].id = identity;
      delete entries[0].items[0].subItems[0].id;
      entries[0].items[0].contents[0].id = null;
      entries[0].items[0].contents[0].subItems[0].id = "";
      database.prepare(`UPDATE ${table} SET items = ?`).run(JSON.stringify(flat ? entries[0].items : entries));
      const pre = captureLocal(database, through);
      expect(compareCaptured(pre, captureLocal(database, through)).verdict).toBe("pass");
      database.exec(listMigrationFiles().find(({ name }) => name === evolutionMigration).sql);
      const post = captureLocal(database, evolutionMigration);
      expect(compareCaptured(pre, post).verdict).toBe("pass");
      expect(compareCaptured(post, captureLocal(database, evolutionMigration)).verdict).toBe("pass");
      const evolved = JSON.parse(database.prepare(`SELECT items FROM ${table}`).get().items);
      for (const target of Object.values(identityTargets)) {
        const corrupt = structuredClone(evolved);
        const node = target(corrupt);
        if (node.id === null) delete node.id;
        else if (node.id === "17") node.id = 17;
        else if (node.id === 17) node.id = "17";
        else node.id = "private-wrong-backfill";
        database.prepare(`UPDATE ${table} SET items = ?`).run(JSON.stringify(corrupt));
        const changed = captureLocal(database, evolutionMigration);
        expect(changed.invariants).toEqual(post.invariants);
        const comparison = compareCaptured(pre, changed);
        expect(comparison.verdict).toBe("fail");
        expect(compareCaptured(post, changed).verdict).toBe("fail");
        expect(JSON.stringify({ pre, post, changed, comparison })).not.toMatch(/private-|Private |owner150-user|owner150-template|owner150-run/);
      }
    } finally { database.close(); }
  });
});

describe("retired identity production invariants", () => {
  it("stops production comparison when raw historic numeric identity tokens lose precision", () => {
    const database = retiredFixtureDatabase();
    try {
      const writeRaw = (token) => database.prepare("UPDATE checklist_runs SET retired_items = ?").run(
        `[{"kind":"item","sectionId":"private-section","item":{"id":${token},"title":"Private synthetic title"}}]`,
      );
      writeRaw("9007199254740992");
      const pre = captureLocal(database);
      expect(compareCaptured(pre, captureLocal(database)).verdict).toBe("pass");
      writeRaw("9007199254740993");
      let report;
      expect(() => { report = compareCaptured(pre, captureLocal(database)); })
        .toThrow("Retired invariant capture contains an unsupported numeric value.");
      expect(report).toBeUndefined();
      expect(JSON.stringify(pre)).not.toMatch(/private-|Private |900719925474099/);
    } finally { database.close(); }
  });

  it.each([
    ["section identity", "section", "9007199254740993"],
    ["item identity", "item", "9007199254740993"],
    ["subitem identity", "subItem", "9007199254740993"],
    ["content identity", "content", "9007199254740993"],
    ["section reference", "sectionId", "9007199254740993"],
    ["item reference", "itemId", "9007199254740993"],
    ["rounded fraction", "itemId", "0.10000000000000001"],
    ["fraction rounded to integer", "item", "1.0000000000000001"],
    ["overflow", "sectionId", "1e400"],
    ["underflow", "subItem", "1e-400"],
    ["negative zero", "content", "-0"],
  ])("fails capture without private diagnostics for unsupported %s", (_label, location, token) => {
    const database = retiredFixtureDatabase();
    try {
      const entries = history();
      const targets = {
        section: [entries[0].section, "id"],
        item: [entries[0].section.items[0], "id"],
        subItem: [entries[2].subItem, "id"],
        content: [entries[0].section.items[0].contents[0], "id"],
        sectionId: [entries[1], "sectionId"],
        itemId: [entries[2], "itemId"],
      };
      const [target, field] = targets[location];
      target[field] = "private-numeric-token";
      writeRetired(database, entries);
      const pre = captureLocal(database);
      expect(compareCaptured(pre, captureLocal(database)).verdict).toBe("pass");
      database.prepare("UPDATE checklist_runs SET retired_items = ?").run(
        JSON.stringify(entries).replace('"private-numeric-token"', token),
      );
      let evidence;
      let caught;
      try { evidence = compareCaptured(pre, captureLocal(database)); }
      catch (error) { caught = error; }
      expect(evidence).toBeUndefined();
      expect(caught?.message).toBe("Retired invariant capture contains an unsupported numeric value.");
      const serialized = JSON.stringify({ pre, evidence, error: caught, message: caught?.message, stack: caught?.stack });
      for (const secret of [token, "private-", "Private ", "owner150-user", "owner150-run", "owner150-template"]) {
        expect(serialized.includes(secret)).toBe(false);
      }
    } finally { database.close(); }
  });

  it("distinguishes supported exact numeric tokens from strings and other exact numbers", () => {
    const database = retiredFixtureDatabase();
    try {
      const writeRaw = (token) => database.prepare("UPDATE checklist_runs SET retired_items = ?").run(
        `[{"kind":"item","sectionId":"private-section","item":{"id":${token},"title":"Private title"}}]`,
      );
      writeRaw("9007199254740992");
      const pre = captureLocal(database);
      for (const token of ['"9007199254740992"', "9007199254740994", "150", "0.1"]) {
        writeRaw(token);
        const post = captureLocal(database);
        expect(compareCaptured(pre, post).verdict).toBe("fail");
        expect(compareCaptured(post, captureLocal(database)).verdict).toBe("pass");
      }
    } finally { database.close(); }
  });

  it("rejects an item identity replacement with unchanged counts and content", () => {
    const database = retiredFixtureDatabase();
    try {
      const entries = [{ kind: "item", sectionId: "private-section", item: { id: "private-item", title: "Private synthetic title" } }];
      expect(validRetiredChecklistContent(entries)).toBe(true);
      writeRetired(database, entries);
      const pre = captureLocal(database);
      expect(compareCaptured(pre, captureLocal(database)).verdict).toBe("pass");
      entries[0].item.id = "private-replacement";
      writeRetired(database, entries);
      const post = captureLocal(database);
      expect(post.invariants).toEqual(pre.invariants);
      expect(compareCaptured(pre, post).verdict).toBe("fail");
      expect(post.domain.digest).not.toBe(pre.domain.digest);
    } finally { database.close(); }
  });

  const history = () => [
    { kind: "section", section: { id: "private-section", title: "Private section title", items: [{
      id: "private-item", title: "Private item title", subItems: [{ id: "private-direct", title: "Private direct title" }],
      contents: [{ id: "150", type: "subItems", subItems: [{ id: "private-nested", title: "Private nested title" }] }],
    }] } },
    { kind: "item", sectionId: "private-section", item: { id: "private-other", title: "Private other title" } },
    { kind: "subItem", sectionId: "private-section", itemId: "private-item", subItem: { id: "private-child", title: "Private child title" } },
  ];
  const changes = [
    ["section identity", (e) => { e[0].section.id = "private-new"; }],
    ["nested item identity", (e) => { e[0].section.items[0].id = "private-new"; }],
    ["direct subitem identity", (e) => { e[0].section.items[0].subItems[0].id = "private-new"; }],
    ["content subitem identity", (e) => { e[0].section.items[0].contents[0].subItems[0].id = "private-new"; }],
    ["retired subitem identity", (e) => { e[2].subItem.id = "private-new"; }],
    ["content identity", (e) => { e[0].section.items[0].contents[0].id = "private-new"; }],
    ["identity JSON type", (e) => { e[0].section.items[0].contents[0].id = 150; }],
    ["missing identity", (e) => { delete e[0].section.id; }],
    ["null identity", (e) => { e[0].section.id = null; }],
    ["empty identity", (e) => { e[0].section.id = ""; }],
    ["section reference", (e) => { e[1].sectionId = "private-new"; }],
    ["item reference", (e) => { e[2].itemId = "private-other"; }],
    ["reference JSON type", (e) => { e[2].itemId = 150; }],
    ["reference equality broken by target identity", (e) => { e[0].section.items[0].id = "private-new"; }],
    ["distinct identities collapsed", (e) => { e[1].item.id = e[0].section.items[0].id; }],
    ["equal identities and references renamed together", (e) => {
      e[0].section.id = e[1].sectionId = e[2].sectionId = "private-new";
    }],
    ["content changed", (e) => { e[0].section.title = "Private replacement title"; }],
  ];
  it.each(changes)("rejects %s without leaking history in capture or comparison reports", (_label, mutate) => {
    const database = retiredFixtureDatabase();
    try {
      const entries = history();
      expect(validRetiredChecklistContent(entries)).toBe(true);
      writeRetired(database, entries);
      const pre = captureLocal(database);
      expect(compareCaptured(pre, captureLocal(database)).verdict).toBe("pass");
      mutate(entries);
      writeRetired(database, entries);
      const post = captureLocal(database);
      expect(post.invariants).toEqual(pre.invariants);
      const comparison = compareCaptured(pre, post);
      expect(comparison.verdict).toBe("fail");
      expect(post.domain.digest).not.toBe(pre.domain.digest);
      const report = JSON.stringify({ pre, post, comparison });
      for (const secret of ["private-", "Private ", "owner150-user", "owner150-run", "owner150-template", "Synthetic "]) {
        expect(report.includes(secret)).toBe(false);
      }
    } finally { database.close(); }
  });

  it("preserves healthy current history across JSON formatting and object-key order", () => {
    const database = retiredFixtureDatabase();
    try {
      writeRetired(database, history());
      const pre = captureLocal(database);
      const reordered = (value) => Array.isArray(value) ? value.map(reordered)
        : value && typeof value === "object" ? Object.fromEntries(Object.entries(value).reverse().map(([k, v]) => [k, reordered(v)])) : value;
      database.prepare("UPDATE checklist_runs SET retired_items = ?").run(JSON.stringify(reordered(history()), null, 2));
      const post = captureLocal(database);
      expect(compareCaptured(pre, post).verdict).toBe("pass");
      expect(post.domain.digest).toBe(pre.domain.digest);
    } finally { database.close(); }
  });

  it("allows only empty retired initialization on the actual 0024 upgrade and preserves no-migration state", () => {
    const through = "0023_add_sitemap_revision_state.sql";
    const database = retiredFixtureDatabase(through);
    try {
      const pre = captureLocal(database, through);
      expect(compareCaptured(pre, captureLocal(database, through)).verdict).toBe("pass");
      database.exec(listMigrationFiles().find(({ name }) => name === evolutionMigration).sql);
      const post = captureLocal(database, evolutionMigration);
      expect(compareCaptured(pre, post).verdict).toBe("pass");
      expect(compareCaptured(post, captureLocal(database, evolutionMigration)).verdict).toBe("pass");
      writeRetired(database, history());
      const nonempty = captureLocal(database, evolutionMigration);
      expect(compareCaptured(pre, nonempty).verdict).toBe("fail");
      expect(compareCaptured(post, nonempty).verdict).toBe("fail");
      expect(compareCaptured(nonempty, post).verdict).toBe("fail");
    } finally { database.close(); }
  });
});

describe("ledger-aware invariant capture", () => {
  it('rejects a remote import summary instead of count rows before capturing source content', () => {
    const database = retiredFixtureDatabase();
    try {
      expect(() => captureLocal(database, undefined, (output, sql) => sql.includes(' AS invariant')
        ? JSON.stringify([{ success: true, meta: { duration: 0 }, finalBookmark: 'fixture-bookmark',
          results: [{ 'Total queries executed': 1, 'Rows read': 0, 'Rows written': 0, 'Database size (MB)': '0.00' }] }])
        : output)).toThrow(/Foreign-key violation count/);
    } finally { database.close(); }
  });
  it("runs the baseline invariants on an exact 0023 database without selecting 0024 columns", () => {
    const appliedMigrations = parseAppliedMigrationLedger(JSON.stringify([
      { success: true, meta: { duration: 0 }, results: ledgerRows("0023_add_sitemap_revision_state.sql") },
    ]));
    const files = selectInvariantSqlFiles({ appliedMigrations });
    const database = replayMigrations({ through: "0023_add_sitemap_revision_state.sql" });

    expect(files.map((entry) => entry.minimumMigration)).toEqual([
      "0001_initial_schema.sql",
    ]);
    expect(queryNames(database, readFileSync(files[0].path, "utf8"))).toEqual(
      expect.arrayContaining(["templates", "runs", "orphaned_templates", "orphaned_runs"]),
    );
    database.close();
  });

  it("adds content/template/revision/retired-item invariants only after 0024 is applied", () => {
    const appliedMigrations = parseAppliedMigrationLedger(JSON.stringify([
      {
        success: true, meta: { duration: 0 }, results: ledgerRows("0023_add_sitemap_revision_state.sql", "0024_safe_template_evolution.sql"),
      },
    ]));
    const files = selectInvariantSqlFiles({ appliedMigrations });
    const database = replayMigrations();
    const names = files.flatMap((entry) =>
      queryNames(database, readFileSync(entry.path, "utf8")),
    );

    expect(files.map((entry) => entry.minimumMigration)).toEqual([
      "0001_initial_schema.sql",
      "0024_safe_template_evolution.sql",
    ]);
    expect(names).toEqual(expect.arrayContaining([
      "templates_invalid_content_version",
      "runs_invalid_template_version",
      "runs_invalid_revision",
      "runs_invalid_retired_json",
    ]));
    database.close();
  });

  it("rejects malformed or ambiguous ledger output", () => {
    for (const output of [
      "",
      "[]",
      JSON.stringify([{ success: true, meta: { duration: 0 }, results: [{}] }]),
      JSON.stringify([{ success: true, meta: { duration: 0 }, results: ledgerRows("0023_add_sitemap_revision_state.sql", "not-a-migration") }]),
      JSON.stringify([{ success: true, meta: { duration: 0 }, results: ledgerRows("0023_add_sitemap_revision_state.sql", "0023_add_sitemap_revision_state.sql") }]),
      JSON.stringify([{ success: true, meta: { duration: 0 }, results: ledgerRows("0024_safe_template_evolution.sql", "0023_add_sitemap_revision_state.sql") }]),
      JSON.stringify([{ success: true, meta: { duration: 0 }, results: [{ id: 2, name: "0023_add_sitemap_revision_state.sql" }, { id: 1, name: "0024_safe_template_evolution.sql" }] }]),
    ]) {
      expect(() => parseAppliedMigrationLedger(output)).toThrow(/ledger/i);
    }
  });

  it("allows an explicitly expected empty ledger only for a first-migration rehearsal baseline", () => {
    const empty = JSON.stringify([{ success: true, meta: { duration: 0 }, results: [] }]);
    expect(parseAppliedMigrationLedger(empty, { allowEmpty: true })).toEqual([]);
    expect(() => parseAppliedMigrationLedger(empty)).toThrow(/ledger/i);
  });

  it("fails exact parity for rogue, missing, or reordered live migration history", () => {
    const expected = ["0023_add_sitemap_revision_state.sql", "0024_safe_template_evolution.sql"];
    expect(compareMigrationLedger({ repositoryMigrations: expected, appliedMigrations: expected }).verdict).toBe("pass");
    expect(compareMigrationLedger({ repositoryMigrations: expected, appliedMigrations: [...expected, "9999_rogue.sql"] })).toMatchObject({ unexpected: ["9999_rogue.sql"], verdict: "fail" });
    expect(compareMigrationLedger({ repositoryMigrations: expected, appliedMigrations: expected.slice(0, 1) })).toMatchObject({ missing: ["0024_safe_template_evolution.sql"], verdict: "fail" });
    expect(compareMigrationLedger({ repositoryMigrations: expected, appliedMigrations: [...expected].reverse() })).toMatchObject({ orderMatches: false, verdict: "fail" });
  });

  it("centralizes ledger-aware remote capture and privacy-safe ownership digest", () => {
    const calls = [];
    const database = retiredFixtureDatabase();
    try {
    const snapshot = captureRemoteInvariantSnapshot({
      database: "rehearsal-db",
      key: "protected-invariant-key-1234567890",
      runWrangler: (args) => {
        calls.push(args);
        const command = args.find(arg => arg.startsWith('--command='))?.slice('--command='.length)
          ?? (args.includes("--command") ? args[args.indexOf("--command") + 1] : null);
        if (command === "SELECT id, name FROM d1_migrations ORDER BY id") {
          return JSON.stringify([{ success: true, meta: { duration: 0 }, results: ledgerRows(...listMigrationFiles().map(({ name }) => name)) }]);
        }
        const sql = command ?? readFileSync(args[args.indexOf("--file") + 1], "utf8");
        return JSON.stringify(sql.split(";").map(part => part.replace(/^\s*--.*$/gm, "").trim()).filter(Boolean)
          .map(statement => ({ success: true, meta: { duration: 0 }, results: database.prepare(statement).all().map(row =>
            Object.fromEntries(Object.entries(row).map(([key, value]) => [key, value === null ? "null" : value]))) })));
      },
    });

    expect(snapshot.hasEvolution).toBe(true);
    expect(snapshot.sqlVersions).toEqual(["0001_initial_schema.sql", "0024_safe_template_evolution.sql"]);
    expect(snapshot.invariants.ownershipDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.domain.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot.domain)).not.toContain("owner150-");
    expect(calls.some((args) => args.includes("--file"))).toBe(false);
    for (const { path } of selectInvariantSqlFiles({ appliedMigrations: snapshot.appliedMigrations })) {
      expect(calls.some(args => args.includes(`--command=${readFileSync(path, 'utf8')}`))).toBe(true);
    }
    } finally { database.close(); }
  });

  it("proves per-row notes, progress, lifecycle, snapshots, and reviewed 0024 version transitions", () => {
    const key = "protected-invariant-key-1234567890";
    const legacyItems = JSON.stringify([{ id: "existing-task", title: "Task", notes: "preserve me", isCompleted: true }]);
    const evolvedItems = JSON.stringify([{ id: "1", title: "Checklist", items: [{ id: "existing-task", title: "Task", notes: "preserve me", isCompleted: true }] }]);
    const pre = privacySafeDomainSnapshot({
      key,
      hasEvolution: false,
      templateRows: [{ id: "t1", user_id: "u1", title: "Template", items: legacyItems, version: 2, deleted_at: null }],
      runRows: [{ id: "r1", user_id: "u1", template_id: "t1", title: "Run", items: legacyItems, status: "completed", progress: 100, is_public: 1, deleted_at: null }],
    });
    const postRows = {
      templateRows: [{ id: "t1", user_id: "u1", title: "Template", items: evolvedItems, version: 3, content_version: 3, deleted_at: null }],
      runRows: [{ id: "r1", user_id: "u1", template_id: "t1", title: "Run", items: evolvedItems, status: "completed", progress: 100, is_public: 1, deleted_at: null, template_version: 0, revision: 1, retired_items: "[]" }],
    };
    const post = privacySafeDomainSnapshot({ key, hasEvolution: true, ...postRows });
    expect(compareDomainSnapshots({ pre, post, preHasEvolution: false, postHasEvolution: true }).verdict).toBe("pass");

    const changed = privacySafeDomainSnapshot({
      key,
      hasEvolution: true,
      ...postRows,
      runRows: [{ ...postRows.runRows[0], progress: 50, items: evolvedItems.replace("preserve me", "lost") }],
    });
    expect(compareDomainSnapshots({ pre, post: changed, preHasEvolution: false, postHasEvolution: true })).toMatchObject({ verdict: "fail" });

    const preWithIdentity = privacySafeDomainSnapshot({
      key,
      hasEvolution: true,
      templateRows: postRows.templateRows,
      runRows: postRows.runRows,
    });
    const identityLost = privacySafeDomainSnapshot({
      key,
      hasEvolution: true,
      templateRows: [{ ...postRows.templateRows[0], items: postRows.templateRows[0].items.replace("existing-task", "wrong-id") }],
      runRows: postRows.runRows,
    });
    expect(compareDomainSnapshots({ pre: preWithIdentity, post: identityLost, preHasEvolution: true, postHasEvolution: true }).failures).toContain("templates stable identity changed, moved, appeared, or disappeared");

    const extraIdentity = privacySafeDomainSnapshot({
      key,
      hasEvolution: true,
      templateRows: [{ ...postRows.templateRows[0], items: postRows.templateRows[0].items.replace('"id":"existing-task"', '"id":"unexpected"') }],
      runRows: postRows.runRows,
    });
    expect(compareDomainSnapshots({ pre, post: extraIdentity, preHasEvolution: false, postHasEvolution: true }).failures).toContain("templates stable identities do not match the reviewed 0024 backfill");
  });
});
