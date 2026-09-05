import { execFileSync, spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import * as drizzleSchema from "../../../../db/schema/index";
import {
  buildCatalogContract,
  buildDrizzleContract,
  catalogFromPragmaResults,
  compareDatabaseSchemas,
  diffDrizzleContract,
  inspectDatabase,
  replayMigrations,
  tableInfoSql,
} from "../../../../scripts/data/schema-contract";
import {
  buildPendingMigrationReport,
  parsePendingMigrationNames,
  renderPendingMigrationSummary,
} from "../../../../scripts/data/pending-migrations-lib.mjs";
import { extractD1Identity } from "../../../../scripts/data/wrangler-identity-lib.mjs";
import { buildFailureReport, writeDataCheckReports } from "../../../../scripts/data/reporting.mjs";

describe("pending migration gate", () => {
  it("extracts the immutable database identity from Wrangler info JSON", () => {
    expect(extractD1Identity(JSON.stringify({
      uuid: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1",
      name: "serp-checklists-db",
    }))).toEqual({
      databaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1",
      databaseName: "serp-checklists-db",
    });
  });

  it("treats Wrangler's pending migration table as a blocking failure", () => {
    const output = `Migrations to be applied:\n┌────┐\n│ 0023_add_sitemap_revision_state.sql │\n│ 0024_safe_template_evolution.sql │\n└────┘`;

    expect(parsePendingMigrationNames(output)).toEqual([
      "0023_add_sitemap_revision_state.sql",
      "0024_safe_template_evolution.sql",
    ]);
  });

  it.each([
    ["empty", ""],
    ["unknown", "Wrangler completed successfully."],
    ["ambiguous clean text", "Status: No migrations to apply! maybe"],
    ["truncated", "Warning: truncated output\nMigrations to be applied:\n│ 0024_safe_template_evolution.sql │"],
    ["missing rows", "Migrations to be applied:\n┌────┐\n└────┘"],
    ["malformed row", "Migrations to be applied:\n┌────┐\n│ definitely-not-a-migration │\n└────┘"],
  ])("fails closed for %s successful output", (_label, output) => {
    expect(() => parsePendingMigrationNames(output)).toThrow(/unrecognized|malformed|truncated/i);
  });

  it("reports a clear fail-closed remediation with target and migration range", () => {
    const report = buildPendingMigrationReport({
      commit: "abc1234",
      database: "serp-checklists-db",
      databaseId: "database-id",
      environment: "production",
      migrationFiles: ["0023_previous.sql", "0024_required.sql"],
      mode: "remote",
      pendingMigrations: ["0024_required.sql"],
    });

    expect(report.verdict).toBe("fail");
    expect(renderPendingMigrationSummary(report)).toContain(
      "BLOCKED production:serp-checklists-db (database-id): 1 pending migration",
    );
    expect(renderPendingMigrationSummary(report)).toContain("Apply the reviewed migration before deploying compatible application code.");
  });

  it("passes only when Wrangler reports no unapplied migration", () => {
    expect(parsePendingMigrationNames("✅ No migrations to apply!")).toEqual([]);
    expect(buildPendingMigrationReport({
      commit: "abc1234",
      database: "local",
      databaseId: "local-id",
      environment: "local",
      migrationFiles: ["0001_initial.sql"],
      mode: "local",
      pendingMigrations: [],
    }).verdict).toBe("pass");
  });

  it("writes text, JSON, and JUnit evidence for command failures", () => {
    const reportDirectory = mkdtempSync(join(tmpdir(), "serplists-failure-report-"));
    try {
      const report = buildFailureReport({
        check: "pending-migrations",
        commit: "abc1234",
        error: new Error("Wrangler command failed"),
        migrationFiles: ["0023_previous.sql", "0024_required.sql"],
        requestedTarget: { environment: "production", database: "serp-checklists-db", mode: "remote" },
        resolvedIdentity: { databaseName: "serp-checklists-db", databaseId: "database-id" },
      });
      const paths = writeDataCheckReports({
        name: "pending-migrations-production",
        report,
        summary: "BLOCKED: Wrangler command failed",
        reportDirectory,
      });

      expect(JSON.parse(readFileSync(paths.json, "utf8"))).toMatchObject({
        commit: "abc1234",
        error: "Wrangler command failed",
        verdict: "fail",
      });
      expect(readFileSync(paths.text, "utf8")).toContain("BLOCKED");
      expect(readFileSync(paths.junit, "utf8")).toContain("failures=\"1\"");
    } finally {
      rmSync(reportDirectory, { recursive: true, force: true });
    }
  });

  it.each([
    ["pending migration", process.execPath, ["scripts/data/check-pending-migrations.mjs"]],
    ["remote schema", process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "tsx", "scripts/data/check-d1-schema.ts"]],
  ])("emits all three fail reports when the %s command cannot start its check", (_label, command, baseArgs) => {
    const reportDirectory = mkdtempSync(join(tmpdir(), "serplists-command-failure-"));
    try {
      const result = spawnSync(command, [...baseArgs, "--report-dir", reportDirectory], {
        cwd: process.cwd(),
        encoding: "utf8",
      });
      const prefix = baseArgs.some((argument) => argument.includes("check-d1-schema"))
        ? "d1-schema-unknown"
        : "pending-migrations-unknown";

      expect(result.status).toBe(1);
      expect(existsSync(join(reportDirectory, `${prefix}.txt`))).toBe(true);
      expect(existsSync(join(reportDirectory, `${prefix}.json`))).toBe(true);
      expect(existsSync(join(reportDirectory, `${prefix}.junit.xml`))).toBe(true);
      expect(JSON.parse(readFileSync(join(reportDirectory, `${prefix}.json`), "utf8"))).toMatchObject({
        commit: expect.any(String),
        error: expect.stringContaining("Usage:"),
        migrationRange: {
          from: "0001_initial_schema.sql",
          to: "0024_safe_template_evolution.sql",
        },
        verdict: "fail",
      });
    } finally {
      rmSync(reportDirectory, { recursive: true, force: true });
    }
  }, 20_000);

  it("exits non-zero through the repository command when the target ledger is behind", () => {
    const persistence = mkdtempSync(join(tmpdir(), "serplists-pending-gate-"));
    try {
      const result = spawnSync(
        process.execPath,
        [
          "scripts/data/check-pending-migrations.mjs",
          "--database", "serp-checklists-db",
          "--label", "test",
          "--local",
          "--persist-to", persistence,
          "--report-dir", join(persistence, "reports"),
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(1);
      expect(result.stdout).toContain("BLOCKED test:serp-checklists-db");
      expect(result.stdout).toContain("0024_safe_template_evolution.sql");
    } finally {
      rmSync(persistence, { recursive: true, force: true });
    }
  }, 20_000);

  it("exits zero through the repository command after Wrangler applies the complete chain", () => {
    const persistence = mkdtempSync(join(tmpdir(), "serplists-current-gate-"));
    try {
      execFileSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        ["exec", "wrangler", "d1", "migrations", "apply", "serp-checklists-db", "--local", "--persist-to", persistence],
        { cwd: process.cwd(), stdio: "ignore" },
      );
      const contract = buildDrizzleContract(drizzleSchema);
      const replayed = replayMigrations();
      const expectedCatalog = inspectDatabase(replayed);
      const migrationContract = buildCatalogContract(expectedCatalog);
      replayed.close();
      const tableNames = [...new Set([
        ...Object.keys(contract.tables),
        ...Object.keys(migrationContract.tables),
      ])].sort();
      const pragmaSql = [
        ...tableNames.map((name) => `${tableInfoSql(name)};`),
        ...tableNames.map((name) => `PRAGMA index_list('${name}');`),
        ...tableNames.map((name) => `SELECT il.name AS index_name, ii.seqno, ii.cid, ii.name AS column_name, ii.name IS NULL AS column_name_is_null, ii.coll, ii.desc, ii.key, sm.sql AS index_sql, sm.sql IS NULL AS index_sql_is_null FROM pragma_index_list('${name}') AS il JOIN pragma_index_xinfo(il.name) AS ii LEFT JOIN sqlite_schema AS sm ON sm.type = 'index' AND sm.name = il.name ORDER BY il.name, ii.seqno;`),
        ...tableNames.map((name) => `PRAGMA foreign_key_list('${name}');`),
        "SELECT type AS object_type, name, tbl_name AS table_name, sql FROM sqlite_schema WHERE type IN ('table','trigger','view') AND name NOT LIKE 'sqlite_%' ORDER BY type,name;",
      ].join(" ");
      const schemaOutput = execFileSync(
        process.platform === "win32" ? "pnpm.cmd" : "pnpm",
        [
          "exec", "wrangler", "d1", "execute", "serp-checklists-db", "--local",
          "--persist-to", persistence, "--json", "--command", pragmaSql,
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );
      const result = spawnSync(
        process.execPath,
        [
          "scripts/data/check-pending-migrations.mjs",
          "--database", "serp-checklists-db",
          "--label", "test",
          "--local",
          "--persist-to", persistence,
          "--report-dir", join(persistence, "reports"),
        ],
        { cwd: process.cwd(), encoding: "utf8" },
      );

      expect(result.status).toBe(0);
      expect(result.stdout).toContain("PASS test:serp-checklists-db");
      expect(result.stdout).toContain("no pending migrations");
      const liveCatalog = catalogFromPragmaResults(tableNames, JSON.parse(schemaOutput));
      expect(diffDrizzleContract(contract, liveCatalog).verdict).toBe("pass");
      expect(diffDrizzleContract(migrationContract, liveCatalog).verdict).toBe("pass");
      expect(compareDatabaseSchemas(expectedCatalog, liveCatalog).verdict).toBe('pass');
      // Actual Wrangler JSON turns absent SQL NULL into the string "null".
      // The explicit flag must preserve no default, DEFAULT NULL and 'null'.
      const defaultOutput = JSON.parse(execFileSync(process.platform === 'win32' ? 'pnpm.cmd' : 'pnpm', [
        'exec', 'wrangler', 'd1', 'execute', 'serp-checklists-db', '--local', '--persist-to', persistence, '--json', '--command',
        `CREATE TABLE default_probe(none TEXT, sql_null TEXT DEFAULT NULL, literal_null TEXT DEFAULT 'null'); CREATE TABLE changed_default_probe(none TEXT DEFAULT NULL, sql_null TEXT, literal_null TEXT DEFAULT NULL); ${tableInfoSql('default_probe')}; ${tableInfoSql('changed_default_probe')};`,
      ], { cwd: process.cwd(), encoding: 'utf8' }));
      const catalog = (columns: { results: Array<Record<string, unknown>> }) => catalogFromPragmaResults(['default_probe'], [columns, { results: [] }, { results: [] }, { results: [] }, { results: [] }]);
      const originalDefaults = catalog(defaultOutput.at(-2));
      const changedDefaults = catalog(defaultOutput.at(-1));
      expect(originalDefaults.tables.default_probe.columns.map(column => column.defaultValue)).toEqual([null, 'null', "'null'"]);
      expect(changedDefaults.tables.default_probe.columns.map(column => column.defaultValue)).toEqual(['null', null, 'null']);
      expect(diffDrizzleContract(buildCatalogContract(originalDefaults), changedDefaults).verdict).toBe('fail');
    } finally {
      rmSync(persistence, { recursive: true, force: true });
    }
  }, 30_000);
});
