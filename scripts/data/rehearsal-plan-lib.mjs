import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { runRepositoryGit } from "./git-subprocess-env.mjs";

const MIGRATION = /^\d{4}_[a-z0-9_]+\.sql$/;
const DATA_ARTIFACT = /^(?:db\/migrations\/\d{4}_[a-z0-9_]+\.sql|db\/maintenance\/[a-z0-9_.-]+\.sql)$/;
export const FIXTURE_PROFILE_CONTRACTS = Object.freeze({
  "template-evolution-v1": Object.freeze({
    affectedTables: ["templates", "checklist_runs"],
    invariants: ["row-counts", "ownership", "active-deleted", "foreign-keys", "json-validity", "template-version-transition", "run-version-transition", "stable-structure-identities", "authenticated-owned-template-read-write", "authenticated-owned-run-read-write", "authenticated-false-empty", "authenticated-api-error"],
  }),
  "application-template-run-v1": Object.freeze({
    affectedTables: ["templates", "checklist_runs"],
    invariants: ["row-counts", "ownership", "active-deleted", "foreign-keys", "json-validity", "stable-structure-identities", "authenticated-owned-template-read-write", "authenticated-owned-run-read-write", "authenticated-false-empty", "authenticated-api-error"],
  }),
});
function exactArray(left, right) { return JSON.stringify(left) === JSON.stringify(right); }
export function rehearsalPlanDigest(plan) { return createHash("sha256").update(JSON.stringify(plan)).digest("hex"); }
export function affectedTablesFromSql(sql) {
  const source = sql.replace(/--[^\n]*/g, " ").replace(/\/\*[\s\S]*?\*\//g, " ");
  const identifier = String.raw`(?:\[[^\]]+\]|["'\x60][^"'\x60]+["'\x60]|[a-z_][a-z0-9_]*)(?:\s*\.\s*(?:\[[^\]]+\]|["'\x60][^"'\x60]+["'\x60]|[a-z_][a-z0-9_]*))?`;
  const patterns = [
    new RegExp(String.raw`(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?(${identifier})`, "gi"),
    new RegExp(String.raw`INSERT(?:\s+OR\s+[A-Z]+)?\s+INTO\s+(${identifier})`, "gi"),
    new RegExp(String.raw`UPDATE(?:\s+OR\s+[A-Z]+)?\s+(${identifier})`, "gi"),
    new RegExp(String.raw`DELETE\s+FROM\s+(${identifier})`, "gi"),
    new RegExp(String.raw`CREATE\s+(?:UNIQUE\s+)?INDEX\s+(?:IF\s+NOT\s+EXISTS\s+)?${identifier}\s+ON\s+(${identifier})`, "gi"),
  ];
  const normalize = (value) => value.split(".").at(-1).trim().replace(/^\[|\]$/g, "").replace(/^["'`]|["'`]$/g, "");
  const tables = patterns.flatMap((pattern) => [...source.matchAll(pattern)].map((match) => normalize(match[1])));
  const unsupported = source.split(";").map((statement) => statement.trim()).filter(Boolean).filter((statement) => {
    if (/^WITH\b/i.test(statement)) return true;
    return /^(?:CREATE\s+(?:UNIQUE\s+)?INDEX\b|DROP\s+INDEX\b|CREATE\s+TRIGGER\b|DROP\s+TRIGGER\b|ALTER\s+TABLE\b|CREATE\s+TABLE\b|DROP\s+TABLE\b|INSERT\b|UPDATE\b|DELETE\b)/i.test(statement) &&
      !patterns.some((pattern) => { pattern.lastIndex = 0; return pattern.test(statement); });
  });
  if (unsupported.length) throw new Error(`Unsupported SQL statement prevents complete affected-table detection: ${unsupported[0].split(/\s+/).slice(0, 4).join(" ")}.`);
  return [...new Set(tables)].sort();
}

export function loadRehearsalPlans({ repoRoot, planPath = path.join(repoRoot, "scripts/data/rehearsal-plans.json") }) {
  const declaration = JSON.parse(readFileSync(planPath, "utf8"));
  if (declaration?.schemaVersion !== 1 || !Array.isArray(declaration.plans)) throw new Error("Rehearsal plan declaration is missing or invalid.");
  for (const plan of declaration.plans) {
    if (!plan.id || !Array.isArray(plan.artifacts) || !Array.isArray(plan.affectedTables) || !plan.affectedTables.length || !Array.isArray(plan.invariants) || !plan.invariants.length || !plan.fixtureProfile || !plan.preMigration) throw new Error(`Rehearsal plan ${plan.id ?? "unknown"} is incomplete.`);
    if ((plan.migrationFrom == null) !== (plan.migrationTo == null) || (plan.migrationFrom != null && (!MIGRATION.test(plan.migrationFrom) || !MIGRATION.test(plan.migrationTo)))) throw new Error(`Rehearsal plan ${plan.id} has an invalid migration range.`);
    if (plan.artifacts.some((artifact) => !DATA_ARTIFACT.test(artifact))) throw new Error(`Rehearsal plan ${plan.id} contains an invalid data artifact.`);
    if (plan.artifacts.some((artifact) => artifact.startsWith("db/maintenance/"))) throw new Error(`Rehearsal plan ${plan.id} contains maintenance SQL, which is blocked until a classified execution path exists.`);
    const fixtureContract = FIXTURE_PROFILE_CONTRACTS[plan.fixtureProfile];
    if (!fixtureContract || !exactArray(plan.affectedTables, fixtureContract.affectedTables) || !exactArray(plan.invariants, fixtureContract.invariants)) throw new Error(`Rehearsal plan ${plan.id} makes unsupported affected-table or invariant claims for fixture profile ${plan.fixtureProfile}.`);
  }
  return declaration;
}

export function resolveRehearsalPlan({ repoRoot, commit, migrationFrom, migrationTo, baseRef, planPath }) {
  if (!/^[0-9a-f]{40}$/.test(commit ?? "")) throw new Error("Rehearsal plan resolution requires the exact candidate commit.");
  const checkedOutCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();
  if (checkedOutCommit !== commit) throw new Error("Rehearsal plan candidate does not match the checked-out commit.");
  const declaration = loadRehearsalPlans({ repoRoot, planPath });
  const migrations = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => MIGRATION.test(name)).sort();
  const explicitNone = migrationFrom === "none" && migrationTo === "none";
  let requestedFrom = explicitNone ? null : migrationFrom;
  let requestedTo = explicitNone ? null : migrationTo;
  let changedArtifacts = [];
  if (baseRef) {
    runRepositoryGit({ repoRoot, args: ["rev-parse", "--verify", baseRef], stdio: ["ignore", "pipe", "pipe"] });
    runRepositoryGit({ repoRoot, args: ["merge-base", "--is-ancestor", baseRef, commit], stdio: ["ignore", "pipe", "pipe"] });
    changedArtifacts = runRepositoryGit({ repoRoot, args: ["diff", "--name-only", `${baseRef}..${commit}`, "--", "db/migrations", "db/maintenance"] }).trim().split(/\r?\n/).filter((name) => DATA_ARTIFACT.test(name));
    if (changedArtifacts.some((artifact) => artifact.startsWith("db/maintenance/"))) throw new Error("Maintenance SQL changes are blocked until a classified rehearsal and protected execution path exists.");
    const changedMigrations = changedArtifacts.filter((name) => name.startsWith("db/migrations/")).map((name) => path.basename(name)).sort();
    if (migrationFrom == null && changedMigrations.length) { requestedFrom = changedMigrations[0]; requestedTo = changedMigrations.at(-1); }
    if (migrationFrom == null && changedArtifacts.length && !changedMigrations.length) throw new Error("Maintenance-only data changes require an explicit exact rehearsal plan selection.");
  }
  if (!baseRef && migrationFrom == null && requestedFrom == null) {
    const latest = migrations.at(-1);
    const defaultPlan = declaration.plans.find((plan) => plan.migrationTo === latest && plan.migrationFrom != null);
    if (!defaultPlan) throw new Error(`Latest migration ${latest ?? "missing"} has no reviewed rehearsal plan.`);
    requestedFrom = defaultPlan.migrationFrom; requestedTo = defaultPlan.migrationTo;
  }
  if (baseRef && migrationFrom == null && changedArtifacts.length === 0) { requestedFrom = null; requestedTo = null; }
  const plan = declaration.plans.find((candidate) => candidate.migrationFrom === requestedFrom && candidate.migrationTo === requestedTo);
  if (!plan) throw new Error(`Reviewed migration range ${requestedFrom ?? "none"}->${requestedTo ?? "none"} has no rehearsal plan.`);
  const fromIndex = plan.migrationFrom == null ? -1 : migrations.indexOf(plan.migrationFrom);
  const toIndex = plan.migrationTo == null ? -1 : migrations.indexOf(plan.migrationTo);
  if (plan.migrationFrom != null && (fromIndex < 0 || toIndex < fromIndex || JSON.stringify(migrations.slice(fromIndex, toIndex + 1).map((name) => `db/migrations/${name}`)) !== JSON.stringify(plan.artifacts.filter((name) => name.startsWith("db/migrations/"))))) throw new Error(`Rehearsal plan ${plan.id} does not exactly cover its contiguous migration range.`);
  const uncovered = changedArtifacts.filter((artifact) => !plan.artifacts.includes(artifact));
  if (uncovered.length) throw new Error(`Changed database artifacts lack affected-table/invariant coverage: ${uncovered.join(", ")}.`);
  const observedAffectedTables = [...new Set(plan.artifacts.flatMap((artifact) => affectedTablesFromSql(readFileSync(path.join(repoRoot, artifact), "utf8"))))].sort();
  if (plan.artifacts.length && !exactArray(observedAffectedTables, [...plan.affectedTables].sort())) throw new Error(`Rehearsal plan ${plan.id} affected tables do not exactly match executable SQL: declared=${plan.affectedTables.join(",")}; observed=${observedAffectedTables.join(",")}.`);
  return { ...plan, commit, migrationRange: { from: plan.migrationFrom, to: plan.migrationTo }, changedArtifacts, observedAffectedTables, declarationSha256: rehearsalPlanDigest(declaration) };
}

export function validateCoverageMatch({ evidence, expected }) {
  if (evidence?.commit !== expected.commit || evidence?.migrationRange?.from !== expected.migrationRange.from || evidence?.migrationRange?.to !== expected.migrationRange.to || evidence?.coverage?.planId !== expected.id || evidence?.coverage?.declarationSha256 !== expected.declarationSha256 || JSON.stringify(evidence?.coverage?.affectedTables) !== JSON.stringify(expected.affectedTables) || JSON.stringify(evidence?.coverage?.invariants) !== JSON.stringify(expected.invariants)) throw new Error("Data-regression range or affected-domain coverage does not match the reviewed request.");
  return evidence;
}
