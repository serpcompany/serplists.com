import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { describe, expect, it } from "vitest";
import { z } from "zod";

import { readD1Databases } from "../../../scripts/d1-baseline-migrations-lib";
import { aCopyOfTheCheckout } from "../../support/checkoutCopy";
import { runAgainstACloudflareD1StandIn } from "../../support/cloudflareD1StandIn";
import { queryTheCopysLocalD1, runTheCopysScript } from "../../support/scriptInACheckoutCopy";

const SCRIPT = "scripts/d1-baseline-migrations.ts";
const repoRoot = process.cwd();
const migrationNames = readdirSync(path.join(repoRoot, "db", "migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort();
const configuredDb = readD1Databases(readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8")).topLevel.find(
  (entry) => entry.binding === "DB",
);
const stagingId = configuredDb?.preview_database_id ?? "";
const productionId = configuredDb?.database_id ?? "";
const appliedRowSchema = z.object({ name: z.string() });

const baseline = (args: string[], databases: Record<string, DatabaseSync> = {}) =>
  runAgainstACloudflareD1StandIn(SCRIPT, { args, databases });

describe("pnpm run db:migrations:baseline:staging (scripts/d1-baseline-migrations.ts), against a D1 API stand-in", { timeout: 120_000 }, () => {
  it("records the migrations through the one named as applied on the staging database, and no later one", async () => {
    const through = migrationNames[2] ?? "";
    const staging = new DatabaseSync(":memory:");

    const run = await baseline(["--remote", "--database", "DB", "--preview", "--through", through, "--execute"], {
      [stagingId]: staging,
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`Baselining 3 migration(s) through ${through} on staging DB --preview (${stagingId}):`);
    expect(run.stdout).toContain("D1 migration baseline complete");
    expect(new Set(run.calls.map((call) => call.databaseId))).toEqual(new Set([stagingId]));
    const applied = staging.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => appliedRowSchema.parse(row).name);
    expect(applied).toEqual(migrationNames.slice(0, 3));
  });

  it("records every migration on the production database's id, without --preview, only when --allow-production says so", async () => {
    const production = new DatabaseSync(":memory:");

    const run = await baseline(["--remote", "--allow-production", "--database", "serp-checklists-db", "--through", "latest", "--execute"], {
      [productionId]: production,
    });

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`Baselining ${migrationNames.length} migration(s) through latest on PRODUCTION serp-checklists-db (${productionId}):`);
    expect(new Set(run.calls.map((call) => call.databaseId))).toEqual(new Set([productionId]));
    const applied = production.prepare("SELECT name FROM d1_migrations ORDER BY id").all().map((row) => appliedRowSchema.parse(row).name);
    expect(applied).toEqual(migrationNames);
  });

  it("only lists what it would record without --execute", async () => {
    const run = await baseline(["--database", "serp-checklists-db", "--through", "latest"]);

    expect(run.status).toBe(0);
    expect(run.stdout).toContain(`Baselining ${migrationNames.length} migration(s) through latest on serp-checklists-db (local):`);
    expect(run.stdout).toContain(`- ${migrationNames.at(-1) ?? ""}`);
    expect(run.stdout).toContain("Dry run only. Re-run with --execute");
    expect(run.calls).toEqual([]);
  });

  it("records the migrations through the one named as applied on this checkout's local database with --execute", { timeout: 300_000 }, async () => {
    const through = migrationNames[1] ?? "";
    const copy = aCopyOfTheCheckout();

    try {
      const run = await runTheCopysScript(copy, SCRIPT, { args: ["--database", "serp-checklists-db", "--through", through, "--execute"], env: { ...process.env, CI: "1" } });

      expect(run.status).toBe(0);
      expect(run.stdout).toContain(`Baselining 2 migration(s) through ${through} on serp-checklists-db (local):`);
      expect(run.stdout).toContain("D1 migration baseline complete");
      const applied = await queryTheCopysLocalD1(copy, "SELECT name FROM d1_migrations ORDER BY id");
      expect(applied.map((row) => appliedRowSchema.parse(row).name)).toEqual(migrationNames.slice(0, 2));
    } finally {
      copy.remove();
    }
  });

  it.each([
    [["--through", "latest"], "Baseline requires --database <name> or D1_DATABASE_NAME."],
    [["--database", "DB"], "Baseline requires --through <migration-prefix|filename|latest>."],
    [["--remote", "--database", "DB", "--through", "latest"], "Refusing to baseline: A remote baseline needs --preview (staging) or --allow-production"],
    [["--database", "DB", "--through", "9999"], "No migration matched --through 9999"],
    [["--database", "DB", "--through", "00"], "--through 00 matched multiple migrations:"],
  ])("refuses %j before touching a database", async (args, refusal) => {
    const run = await baseline(args);

    expect(run.status).toBe(1);
    expect(run.stderr).toContain(refusal);
    expect(run.calls).toEqual([]);
  });
});
