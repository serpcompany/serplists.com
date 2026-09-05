import { mkdtempSync, mkdirSync, readFileSync, copyFileSync, writeFileSync, rmSync, readdirSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { captureSanitizedState, verifySanitizedTransformation } from "./sanitized-state-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";

export function prepareSanitizedSmoke({ repoRoot, persistPath, env, wrangler }) {
  persistPath = path.resolve(repoRoot, persistPath);
  const source = path.resolve(repoRoot, env.PLAYWRIGHT_SANITIZED_REHEARSAL_SQL);
  if (!source.startsWith(`${path.resolve(repoRoot, "tmp/data-evidence")}${path.sep}`)) throw new Error("Sanitized import must stay under tmp/data-evidence/.");
  const sourceSha256 = createHash("sha256").update(readFileSync(source)).digest("hex");
  if (sourceSha256 !== env.PLAYWRIGHT_SANITIZER_SHA256) throw new Error("Sanitized source bytes do not match the artifact digest.");
  const plan = resolveRehearsalPlan({ repoRoot, commit: env.DATA_REGRESSION_START_COMMIT, migrationFrom: env.DATA_REGRESSION_MIGRATION_FROM, migrationTo: env.DATA_REGRESSION_MIGRATION_TO });
  const manifestPath = path.resolve(repoRoot, env.PLAYWRIGHT_SANITIZER_MANIFEST);
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  validateSanitizedRehearsalArtifact({ sql: readFileSync(source, "utf8"), manifest, policy: loadSanitizerPolicy({ repoRoot }), now: new Date(), migrationRange: plan.migrationRange, sourceSchema: plan.preMigration });
  if (manifest.provenance.gitCommit !== plan.commit) throw new Error("Sanitized source commit does not match the candidate.");
  const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
  const preIndex = files.indexOf(plan.preMigration);
  const endIndex = files.indexOf(plan.migrationTo ?? plan.preMigration);
  if (preIndex < 0 || endIndex !== files.length - 1) throw new Error("Candidate smoke requires the reviewed range ending at the complete candidate schema.");
  mkdirSync(persistPath, { recursive: true });
  const directory = mkdtempSync(path.join(persistPath, "rehearsal-config-"));
  try {
    const migrations = path.join(directory, "migrations"); mkdirSync(migrations);
    // Keep the same local binding identity as the candidate Pages Worker.
    const config = path.join(directory, "wrangler.toml");
    writeFileSync(config, readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8").replaceAll('migrations_dir = "db/migrations"', `migrations_dir = ${JSON.stringify(migrations)}`).replace('pages_build_output_dir = "dist"', `pages_build_output_dir = ${JSON.stringify(path.join(repoRoot, "dist"))}`));
    const local = (args) => wrangler([...args, '--local', '--persist-to', persistPath, '--config', config]);
    const apply = () => local(["d1", "migrations", "apply", "serp-checklists-db"]);
    const query = (sql) => local(["d1", "execute", "serp-checklists-db", "--json", "--command", sql]);
    for (const name of files.slice(0, preIndex + 1)) copyFileSync(path.join(repoRoot, "db/migrations", name), path.join(migrations, name));
    apply();
    local(["d1", "execute", "serp-checklists-db", "--file", source, "--yes"]);
    const before = captureSanitizedState({ query, sourceSha256 });
    if (JSON.stringify(before.ledger) !== JSON.stringify(files.slice(0, preIndex + 1))) throw new Error("Sanitized pre-range ledger mismatch.");
    for (const name of files.slice(preIndex + 1, endIndex + 1)) copyFileSync(path.join(repoRoot, "db/migrations", name), path.join(migrations, name));
    apply();
    const after = captureSanitizedState({ query, sourceSha256 });
    verifySanitizedTransformation({ before, after, expectedLedger: files.slice(0, endIndex + 1) });
    const statePath = path.join(persistPath, "sanitized-handler-state.json");
    writeFileSync(statePath, JSON.stringify({ ...after, commit: plan.commit, migrationRange: plan.migrationRange, sourceProfile: manifest.sourceProfile, manifestIntegritySha256: manifest.manifestIntegritySha256, transformation: { verdict: "pass" } }));
    env.PLAYWRIGHT_REHEARSAL_STATE = statePath;
    local(["d1", "execute", "serp-checklists-db", "--file", path.join(repoRoot, "scripts/data/sql/rehearsal-auth-fixture.sql"), "--yes"]);
  } finally { rmSync(directory, { recursive: true, force: true }); }
}
