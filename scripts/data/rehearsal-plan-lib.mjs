import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { runRepositoryGit } from "./git-subprocess-env.mjs";

const MIGRATION = /^\d{4}_[a-z0-9_]+\.sql$/;
const DATA_ARTIFACT = /^(?:db\/migrations\/\d{4}_[a-z0-9_]+\.sql|db\/maintenance\/[a-z0-9_.-]+\.sql)$/;
export function rehearsalPlanDigest(plan) { return createHash("sha256").update(JSON.stringify(plan)).digest("hex"); }
export function affectedTablesFromSql(sql) {
  const patterns = [/(?:ALTER|CREATE|DROP)\s+TABLE\s+(?:IF\s+(?:NOT\s+)?EXISTS\s+)?["'`]?([a-z_][a-z0-9_]*)/gi, /(?:INSERT\s+INTO|UPDATE|DELETE\s+FROM)\s+["'`]?([a-z_][a-z0-9_]*)/gi];
  return [...new Set(patterns.flatMap((pattern) => [...sql.matchAll(pattern)].map((match) => match[1])))].sort();
}

export function loadRehearsalPlans({ repoRoot, planPath = path.join(repoRoot, "scripts/data/rehearsal-plans.json") }) {
  const declaration = JSON.parse(readFileSync(planPath, "utf8"));
  if (declaration?.schemaVersion !== 1 || !Array.isArray(declaration.plans)) throw new Error("Rehearsal plan declaration is missing or invalid.");
  for (const plan of declaration.plans) {
    if (!plan.id || !Array.isArray(plan.artifacts) || !Array.isArray(plan.affectedTables) || !plan.affectedTables.length || !Array.isArray(plan.invariants) || !plan.invariants.length || !plan.fixtureProfile || !plan.preMigration) throw new Error(`Rehearsal plan ${plan.id ?? "unknown"} is incomplete.`);
    if ((plan.migrationFrom == null) !== (plan.migrationTo == null) || (plan.migrationFrom != null && (!MIGRATION.test(plan.migrationFrom) || !MIGRATION.test(plan.migrationTo)))) throw new Error(`Rehearsal plan ${plan.id} has an invalid migration range.`);
    if (plan.artifacts.some((artifact) => !DATA_ARTIFACT.test(artifact))) throw new Error(`Rehearsal plan ${plan.id} contains an invalid data artifact.`);
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
    changedArtifacts = runRepositoryGit({ repoRoot, args: ["diff", "--name-only", `${baseRef}...${commit}`, "--", "db/migrations", "db/maintenance"] }).trim().split(/\r?\n/).filter((name) => DATA_ARTIFACT.test(name));
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
  const undeclaredTables = observedAffectedTables.filter((table) => !plan.affectedTables.includes(table));
  if (undeclaredTables.length) throw new Error(`Rehearsal plan ${plan.id} omits affected tables: ${undeclaredTables.join(", ")}.`);
  return { ...plan, commit, migrationRange: { from: plan.migrationFrom, to: plan.migrationTo }, changedArtifacts, observedAffectedTables, declarationSha256: rehearsalPlanDigest(declaration) };
}

export function validateCoverageMatch({ evidence, expected }) {
  if (evidence?.commit !== expected.commit || evidence?.migrationRange?.from !== expected.migrationRange.from || evidence?.migrationRange?.to !== expected.migrationRange.to || evidence?.coverage?.planId !== expected.id || evidence?.coverage?.declarationSha256 !== expected.declarationSha256 || JSON.stringify(evidence?.coverage?.affectedTables) !== JSON.stringify(expected.affectedTables) || JSON.stringify(evidence?.coverage?.invariants) !== JSON.stringify(expected.invariants)) throw new Error("Data-regression range or affected-domain coverage does not match the reviewed request.");
  return evidence;
}
