import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parseBaselineArgs, readD1Databases, resolveBaselineTarget } from "./d1-baseline-migrations-lib.mjs";
import { execTool } from "./lib/run-tool.mjs";

const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

function getMigrationFiles() {
  const migrationsDir = path.join(repoRoot, "db", "migrations");

  return readdirSync(migrationsDir)
    .filter((fileName) => MIGRATION_FILE_PATTERN.test(fileName))
    .sort((a, b) => a.localeCompare(b));
}

function selectThroughMigration(migrationFiles, throughMigration) {
  if (throughMigration === "latest") return migrationFiles;

  const matches = migrationFiles.filter(
    (fileName) =>
      fileName === throughMigration || fileName.startsWith(throughMigration),
  );
  if (matches.length === 0) {
    throw new Error(`No migration matched --through ${throughMigration}`);
  }
  if (matches.length > 1) {
    throw new Error(
      `--through ${throughMigration} matched multiple migrations: ${matches.join(", ")}`,
    );
  }

  const selectedIndex = migrationFiles.indexOf(matches[0]);
  return migrationFiles.slice(0, selectedIndex + 1);
}

function sqlString(value) {
  return `'${value.replaceAll("'", "''")}'`;
}

function buildBaselineSql(migrationFiles) {
  const migrationValues = migrationFiles
    .map((fileName) => `INSERT OR IGNORE INTO d1_migrations (name) VALUES (${sqlString(fileName)});`)
    .join("\n");

  return `CREATE TABLE IF NOT EXISTS d1_migrations(
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT UNIQUE,
  applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP NOT NULL
);

${migrationValues}
`;
}

function runWranglerBaseline({ databaseName, isRemote, sql, usePreviewDatabase }) {
  const tempDir = mkdtempSync(path.join(tmpdir(), "serp-d1-baseline-"));
  const tempSqlPath = path.join(tempDir, "baseline-d1-migrations.sql");

  try {
    writeFileSync(tempSqlPath, sql, "utf8");
    execTool(
      "wrangler",
      [
        "d1",
        "execute",
        databaseName,
        isRemote ? "--remote" : "--local",
        ...(usePreviewDatabase ? ["--preview"] : []),
        "--file",
        tempSqlPath,
      ],
      {
        cwd: repoRoot,
        env: process.env,
        stdio: "inherit",
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const args = parseBaselineArgs(process.argv.slice(2), process.env);
const { databaseName, isRemote, shouldExecute, throughMigration, usePreview } = args;

if (!databaseName) {
  console.error("Baseline requires --database <name> or D1_DATABASE_NAME.");
  process.exit(1);
}

if (!throughMigration) {
  console.error("Baseline requires --through <migration-prefix|filename|latest>.");
  process.exit(1);
}

const target = resolveBaselineTarget({
  ...args,
  d1: readD1Databases(readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8")),
});
if (!target.ok) {
  console.error(`Refusing to baseline: ${target.error}`);
  process.exit(1);
}

let selectedMigrations;
try {
  selectedMigrations = selectThroughMigration(getMigrationFiles(), throughMigration);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

console.log(`Baselining ${selectedMigrations.length} migration(s) through ${throughMigration} on ${target.label}:`);
for (const fileName of selectedMigrations) {
  console.log(`- ${fileName}`);
}

if (!shouldExecute) {
  console.log("\nDry run only. Re-run with --execute after verifying the target DB already has this schema.");
  process.exit(0);
}

runWranglerBaseline({
  databaseName,
  isRemote,
  sql: buildBaselineSql(selectedMigrations),
  usePreviewDatabase: usePreview,
});

console.log("D1 migration baseline complete");
