import { execFileSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { runDataCommand } from "./data-command-lib.mjs";
import { selectInvariantSqlFiles } from "./invariant-capture-lib.mjs";
import {
  normalizeRehearsalDataExport,
} from "./sanitizer-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function run(command) {
  return execFileSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env: process.env,
    encoding: "utf8",
    maxBuffer: 16 * 1024 * 1024,
  });
}

describe("isolated local rehearsal lifecycle", () => {
  it("replays migrations, applies deterministic fixtures twice, and proves teardown leaves no rows", () => {
    const rehearsalRoot = path.join(repoRoot, ".wrangler/rehearsals");
    mkdirSync(rehearsalRoot, { recursive: true });
    const persistencePath = mkdtempSync(path.join(rehearsalRoot, "vitest-"));
    const relativePersistencePath = path.relative(repoRoot, persistencePath);

    try {
      const common = {
        repoRoot,
        gitCommit: "local-rehearsal-test",
        write: () => {},
        runCommand: run,
      };
      expect(
        runDataCommand({
          ...common,
          argv: [
            "migration-apply",
            "--environment",
            "local",
            "--persist-to",
            relativePersistencePath,
            "--execute",
          ],
        }).executed,
      ).toBe(true);
      const setupArgs = [
        "fixture-setup",
        "--environment",
        "local",
        "--persist-to",
        relativePersistencePath,
        "--execute",
      ];

      expect(runDataCommand({ ...common, argv: setupArgs }).executed).toBe(true);
      expect(runDataCommand({ ...common, argv: setupArgs }).executed).toBe(true);
      expect(
        runDataCommand({
          ...common,
          argv: [
            "fixture-teardown",
            "--environment",
            "local",
            "--persist-to",
            relativePersistencePath,
            "--execute",
          ],
        }).executed,
      ).toBe(true);
    } finally {
      rmSync(persistencePath, { recursive: true, force: true });
    }
  }, 20_000);

  it("round-trips a Wrangler data-only export through a fresh migrated database and invariants", () => {
    const rehearsalRoot = path.join(repoRoot, ".wrangler/rehearsals");
    mkdirSync(rehearsalRoot, { recursive: true });
    const roundTripRoot = mkdtempSync(path.join(rehearsalRoot, "roundtrip-"));
    const sourceRoot = path.join(roundTripRoot, "source");
    const targetRoot = path.join(roundTripRoot, "target");
    mkdirSync(sourceRoot);
    mkdirSync(targetRoot);

    const createConfig = (directory, databaseId) => {
      const configPath = path.join(directory, "wrangler.toml");
      writeFileSync(configPath, [
        'name = "serp-data-roundtrip"',
        'compatibility_date = "2026-09-05"',
        '[[d1_databases]]',
        'binding = "DB"',
        'database_name = "serp-data-roundtrip"',
        `database_id = "${databaseId}"`,
        `migrations_dir = "${path.join(repoRoot, "db/migrations")}"`,
        '',
      ].join("\n"));
      return configPath;
    };

    const sourceConfig = createConfig(sourceRoot, "11111111-1111-4111-8111-111111111111");
    const targetConfig = createConfig(targetRoot, "22222222-2222-4222-8222-222222222222");
    const rawExportPath = path.join(roundTripRoot, "raw-data.sql");
    const sanitizedPath = path.join(roundTripRoot, "sanitized-data.sql");

    const wrangler = (configPath, args) => run([
      "pnpm", "exec", "wrangler", "d1", ...args, "--config", configPath,
    ]);

    try {
      wrangler(sourceConfig, ["migrations", "apply", "serp-data-roundtrip", "--local"]);
      wrangler(sourceConfig, [
        "execute", "serp-data-roundtrip", "--local", "--file",
        path.join(repoRoot, "scripts/data/sanitizers/synthetic-production-shaped-v1.sql"),
        "--yes", "--json",
      ]);
      wrangler(sourceConfig, [
        "export", "serp-data-roundtrip", "--local", "--output", rawExportPath,
        "--no-schema",
      ]);

      const rawExport = readFileSync(rawExportPath, "utf8");
      expect(rawExport).toContain("INSERT INTO");
      expect(rawExport).not.toContain("CREATE TABLE");
      const artifact = normalizeRehearsalDataExport({ repoRoot, rawExport });
      writeFileSync(sanitizedPath, artifact.sql);

      wrangler(targetConfig, ["migrations", "apply", "serp-data-roundtrip", "--local"]);
      wrangler(targetConfig, [
        "execute", "serp-data-roundtrip", "--local", "--file", sanitizedPath,
        "--yes", "--json",
      ]);

      for (const invariant of selectInvariantSqlFiles({
        appliedMigrations: ["0024_safe_template_evolution.sql"],
      })) {
        const output = wrangler(targetConfig, [
          "execute", "serp-data-roundtrip", "--local", "--file", invariant.path,
          "--yes", "--json",
        ]);
        const rows = JSON.parse(output).flatMap((entry) => entry.results ?? []);
        for (const row of rows.filter((entry) =>
          /invalid|orphaned/.test(String(entry.invariant)),
        )) {
          expect(row.total_rows, row.invariant).toBe(0);
        }
      }
    } finally {
      rmSync(roundTripRoot, { recursive: true, force: true });
    }
  }, 30_000);
});
