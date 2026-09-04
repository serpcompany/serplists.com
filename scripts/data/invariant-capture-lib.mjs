import { fileURLToPath } from "node:url";
import { createHmac } from "node:crypto";

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

export function parseInvariantOutput(output) {
  const parsed = JSON.parse(output);
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry?.results ?? []);
  const values = Object.fromEntries(rows.filter((row) => typeof row?.invariant === "string").map((row) => [row.invariant, Number(row.total_rows)]));
  if (!Object.keys(values).length || Object.values(values).some((value) => !Number.isFinite(value))) throw new Error("Remote invariant output is missing or malformed.");
  return values;
}

export function privacySafeOwnershipDigest({ rows, key }) {
  if ((key ?? "").length < 32 || !Array.isArray(rows)) throw new Error("Ownership digest requires protected key and rows.");
  const canonical = rows.map((row) => [String(row.kind), String(row.id), String(row.user_id), String(row.deleted_state)].join("\u001f")).sort().join("\n");
  return createHmac("sha256", key).update(canonical).digest("hex");
}

export function compareProductionInvariants({ pre, post, preHasEvolution = true, postHasEvolution = true, requireOwnershipDigest = true }) {
  const stable = ["users", "templates", "templates_active", "templates_deleted", "template_owners", "runs", "runs_active", "runs_deleted", "run_owners", ...(requireOwnershipDigest ? ["ownershipDigest"] : [])];
  const baseline = [...stable, "templates_invalid_json", "templates_invalid_version", "runs_invalid_json", "orphaned_templates", "orphaned_runs"];
  const evolution = ["templates_invalid_content_version", "runs_invalid_template_version", "runs_invalid_revision", "runs_invalid_retired_json"];
  const omitted = [
    ...baseline.filter((name) => pre[name] === undefined || post[name] === undefined),
    ...(preHasEvolution ? evolution.filter((name) => pre[name] === undefined) : []),
    ...(postHasEvolution ? evolution.filter((name) => post[name] === undefined) : []),
  ];
  const zero = Object.keys(post).filter((name) => name.includes("invalid") || name.startsWith("orphaned_"));
  const failures = [
    ...omitted.map((name) => `${name} omitted`),
    ...stable.filter((name) => pre[name] !== undefined && post[name] !== pre[name]).map((name) => `${name} changed from ${pre[name]} to ${post[name]}`),
    ...zero.filter((name) => post[name] !== 0).map((name) => `${name} is ${post[name]}`),
  ];
  return { pre, post, failures, verdict: failures.length ? "fail" : "pass" };
}

const OWNER_SQL = "SELECT 'template' kind,id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END deleted_state FROM templates UNION ALL SELECT 'run',id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END FROM checklist_runs";

export function captureRemoteInvariantSnapshot({ database, key, runWrangler }) {
  const ledger = parseAppliedMigrationLedger(runWrangler([
    "d1", "execute", database, "--remote", "--json", "--command",
    "SELECT name FROM d1_migrations ORDER BY name",
  ]));
  const selected = selectInvariantSqlFiles({ appliedMigrations: ledger });
  const combined = selected.flatMap((definition) => {
    const parsed = JSON.parse(runWrangler([
      "d1", "execute", database, "--remote", "--json", "--file", definition.path,
    ]));
    return Array.isArray(parsed) ? parsed : [parsed];
  });
  const invariants = parseInvariantOutput(JSON.stringify(combined));
  const ownerOutput = JSON.parse(runWrangler([
    "d1", "execute", database, "--remote", "--json", "--command", OWNER_SQL,
  ]));
  const ownerEntries = Array.isArray(ownerOutput) ? ownerOutput : [ownerOutput];
  invariants.ownershipDigest = privacySafeOwnershipDigest({
    rows: ownerEntries.flatMap((entry) => entry.results ?? []),
    key,
  });
  return {
    invariants,
    hasEvolution: ledger.includes("0024_safe_template_evolution.sql"),
    appliedThrough: ledger.at(-1),
    sqlVersions: selected.map((definition) => definition.minimumMigration),
  };
}
