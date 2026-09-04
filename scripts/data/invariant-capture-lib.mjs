import { fileURLToPath } from "node:url";

const MIGRATION_PATTERN = /^\d{4}_[a-z0-9_]+\.sql$/;
const BASELINE_FILE = fileURLToPath(new URL("./sql/capture-invariants.sql", import.meta.url));
const EVOLUTION_FILE = fileURLToPath(
  new URL("./sql/capture-invariants-0024.sql", import.meta.url),
);

export function parseAppliedMigrationLedger(output) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Applied migration ledger output was not valid JSON.");
  }
  const entries = Array.isArray(parsed) ? parsed : [parsed];
  const names = entries
    .flatMap((entry) => entry?.results ?? [])
    .map((row) => row?.name)
    .filter((name) => typeof name === "string" && MIGRATION_PATTERN.test(name));
  if (names.length === 0) {
    throw new Error("Applied migration ledger did not contain recognized migration names.");
  }
  return [...new Set(names)].sort((left, right) => left.localeCompare(right, "en"));
}

export function selectInvariantSqlFiles({ appliedMigrations }) {
  const files = [
    { minimumMigration: "0001_initial_schema.sql", path: BASELINE_FILE },
  ];
  if (appliedMigrations.includes("0024_safe_template_evolution.sql")) {
    files.push({
      minimumMigration: "0024_safe_template_evolution.sql",
      path: EVOLUTION_FILE,
    });
  }
  return files;
}
