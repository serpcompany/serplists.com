import { mkdtempSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { execTool } from "./lib/run-tool.mjs";

const PRODUCTION_DATABASE_NAME = "serp-checklists-db";
const MIGRATION_FILE_PATTERN = /^\d{4}_.+\.sql$/;

function readArg(name) {
  const prefix = `${name}=`;
  for (let index = process.argv.length - 1; index >= 0; index -= 1) {
    const arg = process.argv[index];
    if (arg.startsWith(prefix)) return arg.slice(prefix.length);
    if (arg === name) {
      const value = process.argv[index + 1];
      return value && !value.startsWith("--") ? value : "";
    }
  }

  return null;
}

function hasArg(name) {
  return process.argv.includes(name);
}

function getMigrationFiles() {
  const scriptDir = path.dirname(fileURLToPath(import.meta.url));
  const migrationsDir = path.resolve(scriptDir, "../db/migrations");

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
        cwd: path.resolve(path.dirname(fileURLToPath(import.meta.url)), ".."),
        env: process.env,
        stdio: "inherit",
      },
    );
  } finally {
    rmSync(tempDir, { recursive: true, force: true });
  }
}

const isRemote = hasArg("--remote");
const isLocal = hasArg("--local") || !isRemote;
const databaseName = readArg("--database") || process.env.D1_DATABASE_NAME;
const throughMigration = readArg("--through");
const shouldExecute = hasArg("--execute");
const allowProduction = hasArg("--allow-production");
const usePreviewDatabase = hasArg("--preview");

if (!databaseName) {
  console.error("Baseline requires --database <name> or D1_DATABASE_NAME.");
  process.exit(1);
}

if (!throughMigration) {
  console.error("Baseline requires --through <migration-prefix|filename|latest>.");
  process.exit(1);
}

if (isRemote && databaseName === PRODUCTION_DATABASE_NAME && !allowProduction) {
  console.error(
    `Refusing to baseline ${PRODUCTION_DATABASE_NAME} without --allow-production.`,
  );
  process.exit(1);
}

let selectedMigrations;
try {
  selectedMigrations = selectThroughMigration(getMigrationFiles(), throughMigration);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}

const target = `${databaseName} (${isRemote ? "remote" : isLocal ? "local" : "unknown"})`;
console.log(`Baselining ${selectedMigrations.length} migration(s) through ${throughMigration} on ${target}:`);
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
  usePreviewDatabase,
});

console.log("D1 migration baseline complete");
