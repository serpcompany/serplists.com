import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { replayMigrations } from "./schema-contract.ts";
import {
  parseAppliedMigrationLedger,
  compareMigrationLedger,
  compareDomainSnapshots,
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

describe("ledger-aware invariant capture", () => {
  it("runs the baseline invariants on an exact 0023 database without selecting 0024 columns", () => {
    const appliedMigrations = parseAppliedMigrationLedger(JSON.stringify([
      { results: ledgerRows("0023_add_sitemap_revision_state.sql") },
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
        results: ledgerRows("0023_add_sitemap_revision_state.sql", "0024_safe_template_evolution.sql"),
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
      JSON.stringify([{ results: [{}] }]),
      JSON.stringify([{ results: ledgerRows("0023_add_sitemap_revision_state.sql", "not-a-migration") }]),
      JSON.stringify([{ results: ledgerRows("0023_add_sitemap_revision_state.sql", "0023_add_sitemap_revision_state.sql") }]),
      JSON.stringify([{ results: ledgerRows("0024_safe_template_evolution.sql", "0023_add_sitemap_revision_state.sql") }]),
      JSON.stringify([{ results: [{ id: 2, name: "0023_add_sitemap_revision_state.sql" }, { id: 1, name: "0024_safe_template_evolution.sql" }] }]),
    ]) {
      expect(() => parseAppliedMigrationLedger(output)).toThrow(/ledger/i);
    }
  });

  it("allows an explicitly expected empty ledger only for a first-migration rehearsal baseline", () => {
    const empty = JSON.stringify([{ results: [] }]);
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
    const snapshot = captureRemoteInvariantSnapshot({
      database: "rehearsal-db",
      key: "protected-invariant-key-1234567890",
      runWrangler: (args) => {
        calls.push(args);
        const command = args[args.indexOf("--command") + 1];
        const file = args[args.indexOf("--file") + 1];
        if (command === "SELECT id, name FROM d1_migrations ORDER BY id") {
          return JSON.stringify([{ results: ledgerRows("0023_add_sitemap_revision_state.sql", "0024_safe_template_evolution.sql") }]);
        }
        if (command?.includes("SELECT 'template'")) {
          return JSON.stringify([{ results: [{ kind: "template", id: "t1", user_id: "u1", deleted_state: "active" }] }]);
        }
        if (command === "SELECT * FROM templates ORDER BY id") {
          return JSON.stringify([{ results: [{ id: "t1", user_id: "u1", items: "[]", version: 2, content_version: 2 }] }]);
        }
        if (command === "SELECT * FROM checklist_runs ORDER BY id") {
          return JSON.stringify([{ results: [{ id: "r1", user_id: "u1", template_id: "t1", items: "[]", template_version: 2, revision: 1, retired_items: "[]" }] }]);
        }
        const sql = readFileSync(file, "utf8");
        const names = sql.match(/'([a-z_]+)'\s+AS invariant/g)?.map((match) => match.match(/'([^']+)'/)[1]) ?? [];
        return JSON.stringify([{ results: names.map((invariant) => ({ invariant, total_rows: 0 })) }]);
      },
    });

    expect(snapshot.hasEvolution).toBe(true);
    expect(snapshot.sqlVersions).toEqual(["0001_initial_schema.sql", "0024_safe_template_evolution.sql"]);
    expect(snapshot.invariants.ownershipDigest).toMatch(/^[0-9a-f]{64}$/);
    expect(snapshot.domain.digest).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(snapshot.domain)).not.toContain("u1");
    expect(calls.filter((args) => args.includes("--file"))).toHaveLength(2);
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
      templateRows: [{ ...postRows.templateRows[0], items: postRows.templateRows[0].items.replace('"title":"Task"', '"id":"unexpected","title":"Task"') }],
      runRows: postRows.runRows,
    });
    expect(compareDomainSnapshots({ pre, post: extraIdentity, preHasEvolution: false, postHasEvolution: true }).failures).toContain("templates stable identities do not match the reviewed 0024 backfill");
  });
});
