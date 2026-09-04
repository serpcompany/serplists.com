import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { DatabaseSync } from "node:sqlite";
import * as drizzleSchema from "../../db/schema/index";
import {
  buildDrizzleContract,
  compareDatabaseSchemas,
  diffDrizzleContract,
  diffUnapprovedSqlOnlyObjects,
  inspectDatabase,
  listMigrationFiles,
  replayMigrations,
} from "./schema-contract";
import { buildFailureReport, writeDataCheckReports } from "./reporting.mjs";

function gitCommit() {
  try {
    return execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    return "unknown";
  }
}

function readArg(name: string) {
  const index = process.argv.indexOf(name);
  return index === -1 ? null : process.argv[index + 1];
}

const commit = gitCommit();
const reportDirectory = readArg("--report-dir") ?? process.env.DATA_REPORT_DIR ?? "tmp/data-reports";
let migrationNames: string[] = [];
try {
  execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-contract-correction.ts", "--report-dir", reportDirectory], { cwd: process.cwd(), encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] });
  const migrations = listMigrationFiles();
  migrationNames = migrations.map((migration) => migration.name);
  const migrated = replayMigrations();
  const snapshot = new DatabaseSync(":memory:");
  try {
    snapshot.exec(readFileSync(new URL("../../db/schema.sql", import.meta.url), "utf8"));
    const migratedCatalog = inspectDatabase(migrated);
    const runtimeDiff = diffDrizzleContract(buildDrizzleContract(drizzleSchema), migratedCatalog);
    const authorityDiff = diffUnapprovedSqlOnlyObjects(buildDrizzleContract(drizzleSchema), migratedCatalog);
    const snapshotDiff = compareDatabaseSchemas(migratedCatalog, inspectDatabase(snapshot));
    const verdict = runtimeDiff.verdict === "pass" && authorityDiff.verdict === "pass" && snapshotDiff.verdict === "pass" ? "pass" : "fail";
    const report = {
      check: "schema-contract",
      commit,
      target: {
        environment: "local",
        database: "fresh-migration-replay",
        databaseId: "local:ephemeral",
      },
      migrationRange: {
        from: migrationNames[0] ?? null,
        to: migrationNames.at(-1) ?? null,
      },
      runtimeDiff,
      authorityDiff,
      snapshotDiff,
      verdict,
    };
    const summary = verdict === "pass"
      ? `PASS Drizzle/D1 schema contract at ${report.commit}; ${report.migrationRange.from} → ${report.migrationRange.to}; db/schema.sql matches.`
      : [
          `BLOCKED Drizzle/D1 schema contract at ${report.commit}.`,
          `Runtime differences: ${JSON.stringify(runtimeDiff)}.`,
          `db/schema.sql differences: ${snapshotDiff.differences.join(", ") || "none"}.`,
          "Add the matching Wrangler migration and regenerate db/schema.sql before merging.",
        ].join("\n");
    const paths = writeDataCheckReports({ name: "schema-contract", report, summary, reportDirectory });
    console.log(summary);
    console.log(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
    if (verdict === "fail") process.exitCode = 1;
  } finally {
    migrated.close();
    snapshot.close();
  }
} catch (error) {
  const report = buildFailureReport({
    check: "schema-contract",
    commit,
    error,
    migrationFiles: migrationNames,
    requestedTarget: { environment: "local", database: "fresh-migration-replay", mode: "local" },
    resolvedIdentity: { databaseName: "fresh-migration-replay", databaseId: "local:ephemeral" },
  });
  const summary = `BLOCKED local schema contract: ${report.error}`;
  const paths = writeDataCheckReports({ name: "schema-contract", report, summary, reportDirectory });
  console.error(summary);
  console.error(`Reports: ${paths.text}, ${paths.json}, ${paths.junit}`);
  process.exitCode = 1;
}
