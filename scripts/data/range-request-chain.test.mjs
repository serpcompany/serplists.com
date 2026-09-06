import { execFileSync, spawnSync } from "node:child_process";
import { chmodSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { resolveCiRehearsalPlans, resolvePendingRehearsalPlan, resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { normalizeMigrationRange, rangeFromPending } from "./migration-range-lib.mjs";
import { selectRangeEvidence } from "./select-range-evidence.mjs";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { parseAppliedMigrationLedger } from './invariant-capture-lib.mjs';
import { completeRehearsalEvidence } from './fixtures/complete-rehearsal-evidence.mjs';

const repoRoot = path.resolve(new URL("../..", import.meta.url).pathname);
const commit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const files = readdirSync(path.join(repoRoot, "db/migrations")).filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
const migration = "0024_safe_template_evolution.sql";
const stagingId = "fcaf4325-5be7-4ead-ab60-45932a04177b";
const productionId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const coverage = (plan) => structuredClone({ verdict: "pass", planId: plan.id, fixtureProfile: plan.fixtureProfile, declarationSha256: plan.declarationSha256, artifactSha256: plan.artifactSha256, affectedTables: plan.affectedTables, invariants: plan.invariants });
const ciReport = (plan) => ({ verdict: "pass", check: "data-regression-suite", commit, workingTreeDirty: false, migrationRange: plan.migrationRange, coverage: coverage(plan), teardown: { verdict: "pass" } });

describe("reviewed range request chain", () => {
  it("produces both CI evidence candidates when the base already contains 0024", () => {
    const plans = resolveCiRehearsalPlans({ repoRoot, commit, baseRef: commit });
    expect(plans.map((plan) => plan.id)).toEqual(["application-only-at-0024", "safe-template-evolution-0024"]);
    expect(plans[1].changedArtifacts).toEqual([]);
    expect(plans[1].artifactSha256[`db/migrations/${migration}`]).toMatch(/^[0-9a-f]{64}$/);
    expect(resolvePendingRehearsalPlan({ repoRoot, commit, baseRef: commit, pending: [migration] }).id).toBe(plans[1].id);
    expect(() => resolvePendingRehearsalPlan({ repoRoot, commit, baseRef: commit, pending: files.slice(-2) })).toThrow(/no rehearsal plan/i);
  });

  it('canonicalizes captured Wrangler filesystem order but rejects duplicate and unknown pending files', () => {
    const table = pending => `Migrations to be applied:\n┌────────────────────┐\n${pending.map(name => `│ ${name} │`).join('\n')}\n└────────────────────┘`;
    // Captured from installed Wrangler 4.54 on a fresh local D1, September 2026.
    const captured = ['0012_cleanup_junk_templates.sql', '0021_add_teams_audit_history.sql', '0005_backfill_template_slugs.sql', '0018_rename_test_users.sql', '0024_safe_template_evolution.sql', '0010_entitlement_overrides.sql', '0015_add_users_created_at_default.sql', '0023_add_sitemap_revision_state.sql', '0013_add_template_type.sql', '0001_initial_schema.sql', '0003_unique_template_slugs.sql', '0017_add_checklist_run_sharing_fields.sql', '0020_add_template_rules.sql', '0014_make_users_password_hash_nullable.sql', '0008_better_auth.sql', '0004_remove_affiliate_and_pages.sql', '0002_add_slug_to_templates.sql', '0009_stripe_billing.sql', '0011_add_template_version.sql', '0007_add_checklist_run_progress.sql', '0016_users_password_hash_nullable_live_safe.sql', '0022_enforce_single_active_team_owner.sql', '0002_add_username_and_profiles.sql', '0019_add_template_seo_fields.sql'];
    expect(parsePendingMigrationNames(table(captured), files)).toEqual([...captured].sort());
    expect(parsePendingMigrationNames(table(captured))).toEqual([...captured].sort());
    expect(() => parsePendingMigrationNames(table([migration, migration]), files)).toThrow(/duplicate/i);
    expect(() => parsePendingMigrationNames(table(['0025_unknown.sql']), files)).toThrow(/unknown/i);
  });

  it('still rejects genuinely reordered applied ledger rows and application sequence IDs', () => {
    const rows = names => JSON.stringify([{ success: true, meta: { duration: 0 }, results: names.map((name, index) => ({ id: index + 1, name })) }]);
    expect(() => parseAppliedMigrationLedger(rows([files[1], files[0]]))).toThrow(/canonical migration order/i);
    expect(() => parseAppliedMigrationLedger(JSON.stringify([{ success: true, meta: { duration: 0 }, results: [{ id: 2, name: files[0] }, { id: 1, name: files[1] }] }]))).toThrow(/sequence/i);
  });

  it.each([
    { from: "none", to: migration }, { from: null, to: migration }, { from: undefined, to: undefined },
    { from: [migration], to: [migration] },
    { from: migration, to: "0023_add_sitemap_revision_state.sql" },
  ])("rejects malformed ranges %j", (range) => expect(() => normalizeMigrationRange(range)).toThrow());

  it.each([[migration, migration], ["0025_unknown.sql"], [migration, files.at(-2)], [files.at(-3), migration]])("rejects unknown, duplicate, reordered or skipped pending history %j", (...pending) => {
    expect(() => rangeFromPending(files, pending)).toThrow();
  });

  it("runs the staging range CLI with real Git provenance and an isolated ledger transport", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "staging-range-chain-"));
    try {
      const transport = path.join(directory, "pnpm");
      // No network: only these fixed read responses exist. Provenance runs real code.
      writeFileSync(transport, `#!${process.execPath}\nconst { execFileSync } = require('node:child_process');
const args = process.argv.slice(2);
if (args[0] === 'run') { execFileSync(process.execPath, ['scripts/data/check-migration-provenance.mjs', ...args.slice(3)], {stdio:'inherit'}); }
else if (args[0] === 'exec' && args[1] === 'drizzle-kit') execFileSync(process.env.TEST_REAL_PNPM, args, {stdio:'inherit'});
else if (args[3] === 'info') console.log(JSON.stringify({name:'serp-checklists-staging-db',uuid:'${stagingId}'}));
else if (args[3] === 'migrations') console.log('Migrations to be applied:\\n┌──────────────────────────────────┐\\n│ ${migration} │\\n└──────────────────────────────────┘');
else if (args[3] === 'execute') console.log(JSON.stringify([{success:true,meta:{duration:0},results:JSON.parse(process.env.TEST_APPLIED_LEDGER).map((name,index)=>({id:index+1,name}))}]));
else process.exit(97);
`);
      chmodSync(transport, 0o755);
      const env = { ...process.env, TEST_REAL_PNPM: execFileSync("which", ["pnpm"], { encoding: "utf8" }).trim(), PATH: `${directory}${path.delimiter}${process.env.PATH}`, STAGING_BASE_SHA: commit, GITHUB_SHA: commit, DATA_REPORT_DIR: directory, GITHUB_ENV: path.join(directory, "env"), TEST_APPLIED_LEDGER: JSON.stringify(files.slice(0, -1)) };
      const script = path.join(repoRoot, "scripts/data/check-staging-reviewed-range.mjs");
      const run = () => spawnSync(process.execPath, [script], { cwd: directory, env, encoding: "utf8" });
      const result = run();
      expect(result.status, result.stdout + result.stderr).toBe(0);
      const reportDirectory = path.join(directory, "tmp/data-reports/staging");
      const report = JSON.parse(readFileSync(path.join(reportDirectory, "staging-reviewed-range.json"), "utf8"));
      expect(report).toMatchObject({ verdict: "pass", commit, pendingMigrations: [migration], migrationRange: { from: migration, to: migration } });
      for (const extension of ["md", "junit.xml"]) expect(readFileSync(path.join(reportDirectory, `staging-reviewed-range.${extension}`), "utf8")).toContain(migration);
      env.TEST_APPLIED_LEDGER = JSON.stringify(files.slice(1, -1));
      expect(run().status).toBe(1);
      expect(readFileSync(path.join(reportDirectory, "staging-reviewed-range.junit.xml"), "utf8")).toContain('failures="1"');
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });

  it.each([migration, "none"])("prepares production pending0024 with staging range %s and exact range-selected CI", (stagingInput) => {
    const directory = mkdtempSync(path.join(tmpdir(), "production-range-chain-"));
    try {
      const plans = resolveCiRehearsalPlans({ repoRoot, commit, baseRef: commit });
      const plan = plans.find((candidate) => candidate.migrationRange.from === migration);
      const stagingPlan = resolveRehearsalPlan({ repoRoot, commit, migrationFrom: stagingInput, migrationTo: stagingInput });
      const ciDirectory = path.join(directory, "ci");
      for (const candidate of plans) {
        mkdirSync(path.join(ciDirectory, candidate.id), { recursive: true });
        writeFileSync(path.join(ciDirectory, candidate.id, "data-regression-suite.json"), JSON.stringify(ciReport(candidate)));
      }
      expect(selectRangeEvidence(ciDirectory, plan.migrationRange).report.coverage.planId).toBe(plan.id);
      const stagingCommit = "c".repeat(40); const tree = "d".repeat(40);
      const reports = {
        correction: { verdict: "pass", commit, eventName: "push", comparisonBase: commit },
        schema: { verdict: "pass", commit, runtimeDiff: { verdict: "pass" }, authorityDiff: { verdict: "pass" }, snapshotDiff: { verdict: "pass" }, migrationRange: { from: files[0], to: migration } },
        rehearsal: completeRehearsalEvidence({ commit, migrationRange: plan.migrationRange, ledger: files, coverage: coverage(plan) }),
        staging: { verdict: "pass", commit: stagingCommit, tree, target: { environment: "staging", databaseId: stagingId }, migrationRange: stagingPlan.migrationRange, pendingMigrations: stagingInput === "none" ? [] : [migration], data: ciReport(stagingPlan), schema: { verdict: "pass", ledger: { verdict: "pass" } }, invariants: { verdict: "pass", migrationRange: stagingPlan.migrationRange, ledger: { verdict: "pass", before: stagingInput === "none" ? files : files.slice(0, -1), after: files } }, deploy: { verdict: "pass" }, smoke: { verdict: "pass", failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: "a".repeat(64), checks: ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"].map((name) => ({ name, verdict: "pass" })) }, teardown: { verdict: "pass" } },
        "ci-run-metadata": { id: 101, head_sha: commit, conclusion: "success", name: "CI", event: "push", head_branch: "main", path: ".github/workflows/ci.yml", repository: { full_name: "serpcompany/serplists.com" } },
        "staging-run-metadata": { id: 102, head_sha: stagingCommit, conclusion: "success", name: "Protected data promotion and Pages deploy", event: "push", head_branch: "staging", path: ".github/workflows/cloudflare-pages-deploy.yml", repository: { full_name: "serpcompany/serplists.com" } },
        "merge-commit": { sha: commit, commit: { tree: { sha: tree } }, parents: [{ sha: commit }] },
        "change-provenance": { mergeCommit: commit, pullRequestNumber: 100, pullRequestHeadCommit: stagingCommit, changeAuthors: ["author"] },
      };
      const args = [path.join(repoRoot, "scripts/data/production-request.mjs"), "--commit", commit, "--migration-from", migration, "--migration-to", migration, "--classification", "backfill", "--database-name", "serp-checklists-db", "--database-id", productionId, "--ci-directory", ciDirectory, "--output", path.join(directory, "request.json")];
      for (const [name, report] of Object.entries(reports)) {
        const file = path.join(directory, `${name}.json`); writeFileSync(file, JSON.stringify(report));
        args.push(`--${["correction", "schema", "rehearsal", "staging"].includes(name) ? `${name}-report` : name}`, file);
      }
      const run = () => spawnSync(process.execPath, args, { cwd: directory, encoding: "utf8" });
      const result = run(); expect(result.status, result.stderr).toBe(0);
      expect(JSON.parse(readFileSync(path.join(directory, "request.json"), "utf8"))).toMatchObject({ pendingMigrations: [migration], migrationRange: plan.migrationRange, ci: { coverage: { artifactSha256: plan.artifactSha256 } } });
      for (const extension of ["md", "junit.xml", "json"]) expect(readFileSync(path.join(directory, `reports/production-request.${extension}`), "utf8")).toContain(commit);
      expect(JSON.parse(readFileSync(path.join(directory, 'request.json'), 'utf8')).rehearsal).toEqual(reports.rehearsal);
      for (const mutate of [
        r => { delete r.sanitizedSource.selection; },
        r => { delete r.remoteRehearsal.invariants.sanitizedState; },
        r => { delete r.authenticatedRehearsal.cohortProof; },
        r => { r.authenticatedRehearsal.cohortProof.cases[0].id = 'invented'; },
        r => { r.authenticatedRehearsal.cohortProof.cases[0].principal = 'rehearsal-owner-99'; },
      ]) {
        const bad = structuredClone(reports.rehearsal); mutate(bad);
        writeFileSync(path.join(directory, 'rehearsal.json'), JSON.stringify(bad));
        rmSync(path.join(directory, 'request.json'), { force: true });
        const rejected = run();
        expect(rejected.status, rejected.stderr).toBe(1);
      }
      writeFileSync(path.join(directory, 'rehearsal.json'), JSON.stringify(reports.rehearsal));
      const ciPath = selectRangeEvidence(ciDirectory, plan.migrationRange).file;
      for (const mutate of [
        (report) => { report.migrationRange = { from: null, to: null }; },
        (report) => { report.coverage.artifactSha256[`db/migrations/${migration}`] = "f".repeat(64); },
        (report) => { report.commit = "f".repeat(40); },
        (report) => { report.coverage.invariants = []; },
      ]) {
        const bad = ciReport(plan); mutate(bad); writeFileSync(ciPath, JSON.stringify(bad));
        expect(run().status).toBe(1);
      }
      writeFileSync(ciPath, JSON.stringify(ciReport(plan)));
      const duplicate = path.join(ciDirectory, "duplicate"); mkdirSync(duplicate);
      writeFileSync(path.join(duplicate, "data-regression-suite.json"), JSON.stringify(ciReport(plan)));
      expect(run().status).toBe(1);
      rmSync(duplicate, { recursive: true });
      reports.staging.invariants.ledger.after = files.slice(0, -1);
      writeFileSync(path.join(directory, "staging.json"), JSON.stringify(reports.staging));
      expect(run().status).toBe(1);
      for (const extension of ["md", "junit.xml", "json"]) expect(readFileSync(path.join(directory, `tmp/data-reports/production-request/production-request.${extension}`), "utf8")).toContain(commit);
    } finally { rmSync(directory, { recursive: true, force: true }); }
  });
});
