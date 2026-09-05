// Wholly synthetic source; never evidence of observed production data.
import { DatabaseSync } from "node:sqlite";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

export function exportSyntheticRows(database) {
  const tables = ["users", "templates", "checklist_runs"];
  if (database.prepare("SELECT name FROM sqlite_schema WHERE name='d1_migrations'").get()) tables.push("d1_migrations");
  return tables.flatMap((table) => database.prepare(`SELECT * FROM ${table}`).all().map((row) =>
    `INSERT INTO ${table} (${Object.keys(row).join(",")}) VALUES (${Object.values(row).map((value) => value == null ? "NULL" : typeof value === "number" ? value : `'${String(value).replaceAll("'", "''")}'`).join(",")});`
  )).join("\n");
}

export function syntheticSourceDatabase(repoRoot, current = false) {
  const database = new DatabaseSync(":memory:");
  database.exec("PRAGMA foreign_keys=ON");
  database.exec("CREATE TABLE d1_migrations(id INTEGER PRIMARY KEY, name TEXT NOT NULL, applied_at TEXT NOT NULL)");
  for (const name of readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_.+\.sql$/.test(name)).sort()) {
    if (name === "0024_safe_template_evolution.sql") break;
    database.exec(readFileSync(path.join(repoRoot, "db/migrations", name), "utf8"));
    database.prepare("INSERT INTO d1_migrations(name,applied_at) VALUES (?,?)").run(name, "2026-09-05");
  }
  database.exec(readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8"));
  if (current) {
    database.exec(readFileSync(path.join(repoRoot, "db/migrations/0024_safe_template_evolution.sql"), "utf8"));
    database.prepare("INSERT INTO d1_migrations(name,applied_at) VALUES (?,?)").run("0024_safe_template_evolution.sql", "2026-09-05");
  }
  return database;
}
