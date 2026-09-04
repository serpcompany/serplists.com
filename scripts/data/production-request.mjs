#!/usr/bin/env node
import { mkdirSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { assertMigrationClassification, validatePromotionEvidence } from "./production-executor-lib.mjs";
import { loadEnvironmentInventory } from "./environment-identity-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";

function arg(name) {
  const index = process.argv.indexOf(name);
  return index < 0 ? null : process.argv[index + 1];
}

try {
  const commit = arg("--commit");
  const from = arg("--migration-from");
  const to = arg("--migration-to");
  const output = arg("--output");
  const databaseName = arg("--database-name");
  const databaseId = arg("--database-id");
  const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
  const production = loadEnvironmentInventory({ repoRoot }).environments.production;
  if (databaseName !== production.databaseName || databaseId !== production.databaseId) {
    throw new Error("Requested production database does not match the checked-in allowlist.");
  }
  const migrations = readdirSync(path.join(repoRoot, "db/migrations"))
    .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const explicitNone = from === "none" && to === "none";
  const fromIndex = migrations.indexOf(from);
  const toIndex = migrations.indexOf(to);
  if (!explicitNone && (fromIndex < 0 || toIndex < fromIndex)) throw new Error("Reviewed migration range is not a contiguous checked-in range.");
  const pendingMigrations = explicitNone ? [] : migrations.slice(fromIndex, toIndex + 1);
  const classification = arg("--classification");
  assertMigrationClassification({
    requested: classification,
    sqlTexts: pendingMigrations.map((name) => readFileSync(path.join(repoRoot, "db/migrations", name), "utf8")),
  });
  const ci = JSON.parse(readFileSync(arg("--ci-report"), "utf8"));
  const rehearsal = JSON.parse(readFileSync(arg("--rehearsal-report"), "utf8"));
  if (!output) throw new Error("Production request requires --output.");
  const evidence = validatePromotionEvidence({
    commit,
    classification,
    database: { databaseName, databaseId },
    migrationRange: explicitNone ? { from: null, to: null } : { from, to },
    pendingMigrations,
    ci,
    rehearsal,
  });
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(evidence, null, 2) + "\n", { mode: 0o600 });
  console.log(`Validated exact-commit production request for ${commit}.`);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({ name: "production-request", report: { check: "production-request", verdict: "fail", commit: arg("--commit") ?? "unknown", error: message }, summary: `BLOCKED production request: ${message}`, reportDirectory: "tmp/data-reports/production-request" });
  console.error(message);
  process.exitCode = 1;
}
