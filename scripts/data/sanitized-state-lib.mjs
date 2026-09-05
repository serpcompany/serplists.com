import { createHash } from "node:crypto";
import { parseAppliedMigrationLedger, privacySafeDomainSnapshot, compareDomainSnapshots } from "./invariant-capture-lib.mjs";

const hash = (value) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === "object") return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonical(value[key])]));
  return value;
}

// Only for already sanitized rehearsal data. This public digest is never a
// substitute for the protected HMAC used to inspect production/customer rows.
export function sanitizedState({ templates, runs, ledger, sourceSha256 }) {
  if (!/^[a-f0-9]{64}$/.test(sourceSha256 ?? "")) throw new Error("Sanitized source digest is required.");
  const ordered = (rows) => [...rows].sort((a, b) => String(a.id).localeCompare(String(b.id), "en"));
  const rows = { templates: ordered(templates), runs: ordered(runs) };
  return { sourceSha256, domainSha256: hash(canonical(rows)), ledger, ledgerSha256: hash(ledger), rows };
}

export function captureSanitizedState({ query, sourceSha256 }) {
  const rows = (sql) => {
    const parsed = JSON.parse(query(sql));
    if (!Array.isArray(parsed) || parsed.length !== 1 || !Array.isArray(parsed[0]?.results)) throw new Error("Incomplete sanitized state query.");
    return parsed[0].results;
  };
  return sanitizedState({ templates: rows("SELECT * FROM templates ORDER BY id"), runs: rows("SELECT * FROM checklist_runs ORDER BY id"), ledger: parseAppliedMigrationLedger(query("SELECT id,name FROM d1_migrations ORDER BY id")), sourceSha256 });
}

export function verifySanitizedTransformation({ before, after, expectedLedger }) {
  if (before.sourceSha256 !== after.sourceSha256 || JSON.stringify(after.ledger) !== JSON.stringify(expectedLedger)) throw new Error("Sanitized state source or exact migration ledger mismatch.");
  const domain = (state) => privacySafeDomainSnapshot({ templateRows: state.rows.templates, runRows: state.rows.runs, key: state.sourceSha256, hasEvolution: state.ledger.includes("0024_safe_template_evolution.sql") });
  const result = compareDomainSnapshots({ pre: domain(before), post: domain(after), preHasEvolution: before.ledger.includes("0024_safe_template_evolution.sql"), postHasEvolution: after.ledger.includes("0024_safe_template_evolution.sql") });
  if (result.verdict !== "pass") throw new Error(`Sanitized transformation failed: ${result.failures.join("; ")}`);
  return result;
}

export function validateSanitizedStateBinding(local, remote) {
  for (const field of ["sourceSha256", "domainSha256", "ledgerSha256"]) {
    if (!/^[a-f0-9]{64}$/.test(local?.[field] ?? "") || local[field] !== remote?.[field]) throw new Error(`Authenticated post-migration sanitized ${field} mismatch.`);
  }
  if (!Array.isArray(local.ledger) || !local.ledger.length || JSON.stringify(local.ledger) !== JSON.stringify(remote?.ledger) || hash(local.ledger) !== local.ledgerSha256) throw new Error("Authenticated post-migration exact ledger mismatch.");
  return true;
}
