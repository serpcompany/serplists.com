import { readFileSync } from "node:fs";

import { describe, expect, it } from "vitest";

import { replayMigrations } from "./schema-contract.ts";
import {
  parseAppliedMigrationLedger,
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

describe("ledger-aware invariant capture", () => {
  it("runs the baseline invariants on an exact 0023 database without selecting 0024 columns", () => {
    const appliedMigrations = parseAppliedMigrationLedger(JSON.stringify([
      { results: [{ name: "0023_add_sitemap_revision_state.sql" }] },
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
        results: [
          { name: "0023_add_sitemap_revision_state.sql" },
          { name: "0024_safe_template_evolution.sql" },
        ],
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
    for (const output of ["", "[]", JSON.stringify([{ results: [{}] }])]) {
      expect(() => parseAppliedMigrationLedger(output)).toThrow(/ledger/i);
    }
  });
});
