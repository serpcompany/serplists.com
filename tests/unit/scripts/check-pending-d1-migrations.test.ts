import { readdirSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";

import { evaluateMigrationListResult } from "../../../scripts/check-pending-d1-migrations";
import {
  scriptRunInAStandInProject,
  STAND_IN_PRODUCTION_ID,
  STAND_IN_STAGING_ID,
  UNAUTHORIZED_ACCOUNT,
} from "../../support/cloudflareD1StandIn";

describe("pending D1 migration gate", () => {
  it("passes only Wrangler's explicit no-pending result", () => {
    expect(evaluateMigrationListResult({
      status: 0,
      stdout: "\u001b[32m✅ No migrations to apply!\u001b[0m\n",
    })).toEqual({ ok: true, reason: "no_pending_migrations" });
  });

  it("blocks deployment when migrations are pending", () => {
    expect(evaluateMigrationListResult({
      status: 0,
      stdout: "Migrations to be applied:\n0024_safe_template_evolution.sql\n",
    })).toEqual({ ok: false, reason: "pending_migrations" });
  });

  it("fails closed when Wrangler fails", () => {
    expect(evaluateMigrationListResult({ status: 1 })).toEqual({
      ok: false,
      reason: "wrangler_failed",
    });
    expect(evaluateMigrationListResult({
      status: null,
      error: new Error("spawn failed"),
    })).toEqual({ ok: false, reason: "wrangler_failed" });
  });

  it("fails closed when successful output is unrecognized", () => {
    expect(evaluateMigrationListResult({
      status: 0,
      stdout: "Migration status unavailable\n",
    })).toEqual({ ok: false, reason: "unrecognized_output" });
  });
});

const migrationNames = readdirSync(path.join(process.cwd(), "db", "migrations")).filter((name) => name.endsWith(".sql")).sort();

function databaseThatApplied(names: readonly string[]) {
  const database = new DatabaseSync(":memory:");
  database.exec("CREATE TABLE d1_migrations (id INTEGER PRIMARY KEY AUTOINCREMENT, name TEXT UNIQUE, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL)");
  const insert = database.prepare("INSERT INTO d1_migrations (name) VALUES (?)");
  for (const name of names) insert.run(name);
  return database;
}

describe("pnpm run db:migrations:check:staging and :prod, against a D1 API stand-in", { timeout: 120_000 }, () => {
  const check = scriptRunInAStandInProject("scripts/check-pending-d1-migrations.ts");

  it("passes a staging database that has applied every migration, reading it through --preview", async () => {
    const run = await check(["--database", "DB", "--label", "staging", "--preview"], {
      [STAND_IN_STAGING_ID]: databaseThatApplied(migrationNames),
    });

    expect(run.stderr).not.toContain("blocked");
    expect(run.status).toBe(0);
    expect(run.stdout).toContain("staging D1 has no pending migrations (DB).");
    expect(new Set(run.calls.map((call) => call.databaseId))).toEqual(new Set([STAND_IN_STAGING_ID]));
  });

  it("blocks the deployment while the newest migration is still pending", async () => {
    const run = await check(["--database", "serp-checklists-db", "--label", "production"], {
      [STAND_IN_PRODUCTION_ID]: databaseThatApplied(migrationNames.slice(0, -1)),
    });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("production D1 has pending migrations; deployment is blocked (serp-checklists-db).");
  });

  it("blocks the deployment when Wrangler cannot read the database", async () => {
    const run = await check(["--database", "DB"], {}, { failWith: UNAUTHORIZED_ACCOUNT });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("target D1 migration check failed; deployment is blocked (DB).");
    expect(run.calls).not.toEqual([]);
  });

  it("blocks the deployment when Wrangler succeeds but prints neither verdict, as it does with WRANGLER_LOG=error", async () => {
    const run = await check(["--database", "DB", "--label", "production"], {
      [STAND_IN_PRODUCTION_ID]: databaseThatApplied(migrationNames),
    }, { env: { WRANGLER_LOG: "error" } });

    expect(run.status).toBe(1);
    expect(run.stdout).toBe("");
    expect(run.stderr).toContain("production D1 migration status was not recognized; deployment is blocked (DB).");
  });

  it("needs --database", async () => {
    const run = await check(["--label", "staging"], {});

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Missing required --database value.");
    expect(run.calls).toEqual([]);
  });
});
