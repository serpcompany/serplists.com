import { completeRehearsalEvidence } from './complete-rehearsal-evidence.mjs';
import { repositoryMigrationHistory } from '../production-preparation-lib.mjs';

export function completePromotionEvidence({ commit, database: production }) {
  const baseCommit = "b".repeat(40);
  const stagingCommit = "c".repeat(40);
  const tree = "d".repeat(40);
  return {
    commit,
    classification: "backfill",
    database: production,
    pendingMigrations: ["0024_safe_template_evolution.sql"],
    migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
    ci: { verdict: "pass", commit, workingTreeDirty: false, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, coverage: { verdict: "pass", planId: "safe-template-evolution-0024", fixtureProfile: "template-evolution-v1", affectedTables: ["templates", "checklist_runs"], invariants: ["row-counts"], declarationSha256: "a".repeat(64) } },
    ciContractCorrection: { verdict: "pass", commit, eventName: "push", comparisonBase: baseCommit },
    ciSchemaContract: { verdict: "pass", commit, runtimeDiff: { verdict: "pass" }, authorityDiff: { verdict: "pass" }, snapshotDiff: { verdict: "pass" }, migrationRange: { from: "0001_initial_schema.sql", to: "0024_safe_template_evolution.sql" } },
    rehearsal: completeRehearsalEvidence({
      commit, ledger: repositoryMigrationHistory(),
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      coverage: { verdict: "pass", planId: "safe-template-evolution-0024", fixtureProfile: "template-evolution-v1", affectedTables: ["templates", "checklist_runs"], invariants: ["row-counts"], declarationSha256: "a".repeat(64) },
    }),
    ciRun: { id: 101, head_sha: commit, conclusion: "success", name: "CI", event: "push", head_branch: "main", path: ".github/workflows/ci.yml", repository: { full_name: "serpcompany/serplists.com" } },
    stagingRun: { id: 102, head_sha: stagingCommit, conclusion: "success", name: "Protected data promotion and Pages deploy", event: "push", head_branch: "staging", path: ".github/workflows/cloudflare-pages-deploy.yml", repository: { full_name: "serpcompany/serplists.com" } },
    mergeContext: { commit, tree, baseCommit },
    changeProvenance: { mergeCommit: commit, pullRequestNumber: 100, pullRequestHeadCommit: stagingCommit, changeAuthors: ["author"] },
    staging: {
      verdict: "pass",
      commit: stagingCommit,
      tree,
      target: { environment: "staging", databaseName: "serp-checklists-staging-db", databaseId: "fcaf4325-5be7-4ead-ab60-45932a04177b" },
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      data: { verdict: "pass" },
      schema: { verdict: "pass", ledger: { verdict: "pass" } },
      invariants: { verdict: "pass" },
      deploy: { verdict: "pass" },
      smoke: { verdict: "pass", failures: [], controlledCanaryMutationApproved: true, canaryEvidenceDigest: "a".repeat(64), checks: ["template_canary_designated", "template_write", "template_write_readback", "template_restore", "run_canary_designated", "run_write", "run_write_readback", "run_restore"].map((name) => ({ name, verdict: "pass" })) },
      teardown: { verdict: "pass" },
    },
  };
}
