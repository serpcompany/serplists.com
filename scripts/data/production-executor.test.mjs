import { spawnSync } from "node:child_process";
import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

import {
  assertDeployEvidence,
  assertProductionWorkflowContext,
  assertMigrationClassification,
  createSignedEvidence,
  compareProductionInvariants,
  parseInvariantOutput,
  privacySafeOwnershipDigest,
  runProductionDataPhase,
  validateGitHubRunEvidence,
  validatePromotionEvidence,
  validateApprovalEvidence,
  validateChangeProvenance,
  validateFinalProductionRelease,
} from "./production-executor-lib.mjs";

const commit = "0123456789abcdef0123456789abcdef01234567";
const production = {
  databaseName: "serp-checklists-db",
  databaseId: "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1",
};
const context = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "serpcompany/serplists.com",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_PROTECTED: "true",
  GITHUB_SHA: commit,
  GITHUB_RUN_ID: "123456",
  GITHUB_RUN_ATTEMPT: "1",
  DATA_PROTECTED_ENVIRONMENT: "production",
  CLOUDFLARE_API_TOKEN: "environment-scoped-token",
  PRODUCTION_BACKUP_ENCRYPTION_KEY: "protected-backup-encryption-key-123456",
  PRODUCTION_INVARIANT_HMAC_KEY: "protected-invariant-hmac-key-123456789",
};

function validPromotionEvidence() {
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
    rehearsal: {
      verdict: "pass",
      commit,
      target: { environment: "rehearsal", databaseId: "11111111-1111-4111-8111-111111111111" },
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      recovery: { verdict: "pass" },
      teardown: { verdict: "pass" },
      sanitizedSource: { verdict: "pass", attestation: { verdict: "pass" }, artifactSha256: "b".repeat(64) },
      authenticatedRehearsal: { verdict: "pass", commit, sanitizerArtifactSha256: "b".repeat(64), migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, checks: { templateRead: true, runRead: true, templateWrite: true, runWrite: true, falseEmptyDetection: "pass", apiErrorDetection: "pass" } },
      coverage: { verdict: "pass", planId: "safe-template-evolution-0024", fixtureProfile: "template-evolution-v1", affectedTables: ["templates", "checklist_runs"], invariants: ["row-counts"], declarationSha256: "a".repeat(64) },
    },
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
      smoke: { verdict: "pass", failures: [] },
      teardown: { verdict: "pass" },
    },
  };
}

describe("protected production executor", () => {
  it("rejects local, push, unprotected, mismatched-commit, and legacy credential contexts", () => {
    for (const env of [
      {},
      { ...context, GITHUB_EVENT_NAME: "push" },
      { ...context, GITHUB_REF_PROTECTED: "false" },
      { ...context, GITHUB_SHA: "f".repeat(40) },
      { ...context, CLOUDFLARE_API_TOKEN: "", CLOUDFLARE_API_KEY: "legacy", CLOUDFLARE_EMAIL: "owner@example.test" },
    ]) {
      expect(() => assertProductionWorkflowContext({ env, expectedCommit: commit })).toThrow();
    }
  });

  it("requires distinct production invariant and backup keys", () => {
    expect(assertProductionWorkflowContext({ env: context, expectedCommit: commit })).toMatchObject({
      commit,
      protectedEnvironment: "production",
    });
    expect(() => assertProductionWorkflowContext({
      env: { ...context, PRODUCTION_INVARIANT_HMAC_KEY: "" },
      expectedCommit: commit,
    })).toThrow(/invariant HMAC key is missing/i);
    expect(() => assertProductionWorkflowContext({
      env: {
        ...context,
        PRODUCTION_INVARIANT_HMAC_KEY: context.PRODUCTION_BACKUP_ENCRYPTION_KEY,
      },
      expectedCommit: commit,
    })).toThrow(/must be separate/i);
  });

  it("requires exact passing CI and rehearsal evidence for the requested commit and migration range", () => {
    const evidence = validPromotionEvidence();

    expect(validatePromotionEvidence(evidence)).toEqual(evidence);
    for (const invalid of [
      { ...evidence, classification: "unclassified" },
      { ...evidence, ci: { ...evidence.ci, verdict: "fail" } },
      { ...evidence, ci: { ...evidence.ci, coverage: { ...evidence.ci.coverage, affectedTables: ["usage_analytics"] } } },
      { ...evidence, ciContractCorrection: { ...evidence.ciContractCorrection, eventName: "local-working-tree" } },
      { ...evidence, ciContractCorrection: { ...evidence.ciContractCorrection, comparisonBase: null } },
      { ...evidence, ciRun: { ...evidence.ciRun, event: "workflow_dispatch" } },
      { ...evidence, staging: { ...evidence.staging, tree: "e".repeat(40) } },
      { ...evidence, staging: { ...evidence.staging, teardown: { verdict: "fail" } } },
      { ...evidence, ciSchemaContract: { ...evidence.ciSchemaContract, authorityDiff: { verdict: "fail" } } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, commit: "f".repeat(40) } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, target: { environment: "production", databaseId: production.databaseId } } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, recovery: { verdict: "fail" } } },
    ]) expect(() => validatePromotionEvidence(invalid)).toThrow();
  });

  it("supports an explicit no-migrations release only with a proven clean ledger", () => {
    const evidence = validPromotionEvidence();
    evidence.classification = "additive";
    evidence.migrationRange = { from: null, to: null };
    evidence.pendingMigrations = [];
    evidence.ci.migrationRange = { from: null, to: null };
    evidence.ci.coverage = { ...evidence.ci.coverage, planId: "application-only-at-0024" };
    evidence.rehearsal.migrationRange = { from: null, to: null };
    evidence.rehearsal.coverage = evidence.ci.coverage;
    evidence.rehearsal.authenticatedRehearsal.migrationRange = { from: null, to: null };
    evidence.staging.migrationRange = { from: null, to: null };
    expect(validatePromotionEvidence(evidence).pendingMigrations).toEqual([]);
  });

  it("rejects artifacts unless GitHub identifies the exact successful workflow and commit", () => {
    const metadata = { id: 123, head_sha: commit, conclusion: "success", name: "CI", event: "push", head_branch: "main", path: ".github/workflows/ci.yml", repository: { full_name: "serpcompany/serplists.com" } };
    const options = { metadata, commit, workflowName: "CI", eventName: "push", headBranch: "main", workflowPath: ".github/workflows/ci.yml" };
    expect(validateGitHubRunEvidence(options)).toEqual(metadata);
    for (const invalid of [
      { ...metadata, head_sha: "f".repeat(40) },
      { ...metadata, conclusion: "failure" },
      { ...metadata, name: "Untrusted workflow" },
      { ...metadata, event: "workflow_dispatch" },
      { ...metadata, head_branch: "staging" },
      { ...metadata, path: ".github/workflows/untrusted.yml" },
      { ...metadata, repository: { full_name: "other/repo" } },
    ]) expect(() => validateGitHubRunEvidence({ ...options, metadata: invalid })).toThrow();
  });

  it("derives the highest migration risk and rejects under-classification", () => {
    expect(assertMigrationClassification({ requested: "additive", sqlTexts: [] })).toBe("additive");
    expect(assertMigrationClassification({ requested: "backfill", sqlTexts: ["ALTER TABLE x ADD COLUMN y TEXT; UPDATE x SET y='a';"] })).toBe("backfill");
    expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: ["DELETE FROM x;"] })).toThrow(/destructive/i);
  });

  it("classifies only positively allowlisted compatible schema additions as additive", () => {
    for (const sql of [
      "CREATE TABLE IF NOT EXISTS audit_events (id TEXT PRIMARY KEY, value TEXT NOT NULL);",
      "CREATE INDEX IF NOT EXISTS idx_events_value ON audit_events(value);",
      "ALTER TABLE templates ADD COLUMN subtitle TEXT;",
      "ALTER TABLE templates ADD COLUMN enabled INTEGER NOT NULL DEFAULT 1;",
      "PRAGMA defer_foreign_keys=TRUE; BEGIN TRANSACTION; COMMIT;",
      "-- DROP TABLE ignored_comment\nALTER TABLE templates ADD COLUMN note TEXT DEFAULT 'semi;colon';",
    ]) {
      expect(assertMigrationClassification({ requested: "additive", sqlTexts: [sql] })).toBe("additive");
    }
  });

  it("classifies CREATE TABLE AS SELECT as a data backfill", () => {
    for (const sql of [
      "CREATE TABLE copied_templates AS SELECT * FROM templates;",
      "CREATE TABLE copied AS WITH source(v) AS (SELECT 7) SELECT v FROM source;",
      "CREATE TABLE copied AS/*split*/SELECT 9 AS v;",
    ]) {
      expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: [sql] })).toThrow(/backfill/i);
      expect(assertMigrationClassification({ requested: "backfill", sqlTexts: [sql] })).toBe("backfill");
    }
  });

  it("elevates unique indexes and required columns without safe defaults", () => {
    for (const sql of [
      "CREATE UNIQUE INDEX idx_templates_slug ON templates(slug);",
      "ALTER TABLE templates ADD COLUMN required_value TEXT NOT NULL;",
      "ALTER TABLE templates ADD COLUMN required_value TEXT NOT NULL DEFAULT NULL;",
      "PRAGMA foreign_keys=OFF;",
    ]) {
      expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: [sql] })).toThrow(/destructive/i);
      expect(assertMigrationClassification({ requested: "destructive", sqlTexts: [sql] })).toBe("destructive");
    }
  });

  it("fails unknown executable syntax closed as irreversible and uses highest mixed risk", () => {
    expect(() => assertMigrationClassification({ requested: "destructive", sqlTexts: ["VACUUM;"] })).toThrow(/irreversible/i);
    expect(assertMigrationClassification({ requested: "irreversible", sqlTexts: ["VACUUM;"] })).toBe("irreversible");
    expect(assertMigrationClassification({
      requested: "destructive",
      sqlTexts: [
        "CREATE TABLE safe_new (id TEXT); UPDATE templates SET title='changed';",
        "ALTER TABLE templates RENAME COLUMN title TO old_title;",
      ],
    })).toBe("destructive");
    expect(assertMigrationClassification({
      requested: "destructive",
      sqlTexts: ["CREATE TABLE safe_new (id TEXT);", "DELETE FROM templates;"],
    })).toBe("destructive");
  });

  it("binds approval independence to every actual change author, not the dispatcher", () => {
    const productionReview = (login, comment = "Reviewed recovery and invariant evidence.") => ({
      state: "approved", comment, user: { login, type: "User" }, environments: [{ name: "production" }],
    });
    const changeAuthors = ["pr-author", "commit-author"];
    expect(validateApprovalEvidence({ reviews: [productionReview("independent-reviewer")], classification: "backfill", actor: "dispatcher", changeAuthors }).approver).toBe("independent-reviewer");
    expect(() => validateApprovalEvidence({ reviews: [productionReview("pr-author")], classification: "additive", actor: "different-dispatcher", changeAuthors })).toThrow(/independent/i);
    expect(() => validateApprovalEvidence({ reviews: [productionReview("COMMIT-AUTHOR")], classification: "additive", actor: "dispatcher", changeAuthors })).toThrow(/independent/i);
    expect(() => validateApprovalEvidence({ reviews: [{ ...productionReview("independent"), environments: [{ name: "staging" }] }], classification: "additive", actor: "dispatcher", changeAuthors })).toThrow(/production/i);
    expect(() => validateApprovalEvidence({ reviews: [productionReview("independent", "short")], classification: "destructive", actor: "dispatcher", changeAuthors })).toThrow(/decision/i);
  });

  it("requires distinct verified repository-admin production approval for irreversible changes", () => {
    const review = (login, environment = "production") => ({ state: "approved", comment: "Reviewed irreversible recovery evidence.", user: { login, type: "User" }, environments: [{ name: environment }] });
    const base = { reviews: [review("independent"), review("repo-owner", "production-owner-approval")], classification: "irreversible", actor: "dispatcher", changeAuthors: ["author"], repositoryOwnerApprover: "repo-owner" };
    expect(validateApprovalEvidence({ ...base, ownerPermission: { permission: "admin", user: { login: "repo-owner" } } })).toMatchObject({ approver: "independent", repositoryOwnerApprover: "repo-owner" });
    expect(() => validateApprovalEvidence({ ...base, ownerPermission: { permission: "write", user: { login: "repo-owner" } } })).toThrow(/admin/i);
    expect(() => validateApprovalEvidence({ ...base, reviews: [review("repo-owner", "production-owner-approval")], ownerPermission: { permission: "admin", user: { login: "repo-owner" } } })).toThrow(/distinct/i);
    expect(() => validateApprovalEvidence({ ...base, changeAuthors: ["repo-owner"], ownerPermission: { permission: "admin", user: { login: "repo-owner" } } })).toThrow(/author/i);
  });

  it("accepts ordinary unsigned constituent commits while binding exact verified merge provenance and every author", () => {
    const pulls = [{ number: 100, merged_at: "2026-09-05T00:00:00Z", merge_commit_sha: commit, base: { ref: "main" }, head: { sha: "c".repeat(40) }, user: { login: "PR-Author" } }];
    const mergeCommit = {
      sha: commit,
      author: { login: "merge-author", type: "User" },
      committer: { login: "web-flow", type: "User" },
      commit: { verification: { verified: true, reason: "valid" } },
    };
    const mergeAuthors = { data: { repository: { object: { oid: commit, authors: { nodes: [{ user: { login: "merge-author" } }], pageInfo: { hasNextPage: false } } } } } };
    const commits = [
      { sha: "1".repeat(40), author: { login: "commit-author" }, committer: { login: "trusted-committer" }, commit: { message: "Change\n\nCo-authored-by: Human <human@example.test>", verification: { verified: false } } },
      { sha: "2".repeat(40), author: { login: "pr-author" }, committer: { login: "trusted-committer" }, commit: { message: "Other", verification: { verified: false } } },
    ];
    const commitAuthors = [{
      data: { repository: { pullRequest: { commits: { nodes: [
        { commit: { oid: "1".repeat(40), authors: { nodes: [{ user: { login: "commit-author" } }, { user: { login: "co-author" } }], pageInfo: { hasNextPage: false } } } },
        { commit: { oid: "2".repeat(40), authors: { nodes: [{ user: { login: "pr-author" } }], pageInfo: { hasNextPage: false } } } },
      ] } } } },
    }];
    const provenance = validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit });
    expect(provenance).toEqual({
      pullRequestNumber: 100,
      pullRequestHeadCommit: "c".repeat(40),
      mergeCommit: commit,
      changeAuthors: ["co-author", "commit-author", "merge-author", "pr-author", "trusted-committer", "web-flow"],
      mergeProvenance: { verification: "verified", author: "merge-author", committer: "web-flow", authors: ["merge-author"] },
    });

    const productionReview = (login) => ({
      state: "approved",
      comment: "Reviewed exact merge and recovery evidence.",
      user: { login, type: "User" },
      environments: [{ name: "production" }],
    });
    for (const author of ["pr-author", "commit-author", "merge-author"]) {
      expect(() => validateApprovalEvidence({
        reviews: [productionReview(author)],
        classification: "backfill",
        actor: "dispatcher",
        changeAuthors: provenance.changeAuthors,
      })).toThrow(/independent/i);
    }

    expect(() => validateChangeProvenance({ pulls: [], commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/pull request/i);
    expect(() => validateChangeProvenance({ pulls: [{ ...pulls[0], base: { ref: "staging" } }], commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/pull request/i);
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit: { ...mergeCommit, sha: "f".repeat(40) }, mergeAuthors, expectedCommit: commit })).toThrow(/merge provenance/i);
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit: { ...mergeCommit, commit: { verification: { verified: false } } }, mergeAuthors, expectedCommit: commit })).toThrow(/merge provenance/i);
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit: { ...mergeCommit, author: null }, mergeAuthors, expectedCommit: commit })).toThrow(/attributed/i);
    expect(() => validateChangeProvenance({ pulls, commits: [{ ...commits[0], author: null }, commits[1]], commitAuthors, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/author/i);
    const unresolvedCoauthor = structuredClone(commitAuthors);
    unresolvedCoauthor[0].data.repository.pullRequest.commits.nodes[0].commit.authors.nodes.push({ user: null });
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors: unresolvedCoauthor, mergeCommit, mergeAuthors, expectedCommit: commit })).toThrow(/co-author/i);
    const unresolvedMergeCoauthor = structuredClone(mergeAuthors);
    unresolvedMergeCoauthor.data.repository.object.authors.nodes.push({ user: null });
    expect(() => validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit, mergeAuthors: unresolvedMergeCoauthor, expectedCommit: commit })).toThrow(/co-author/i);
  });

  it.each([
    ["missing", null, "backfill", ""],
    ["malformed", "not json", "backfill", ""],
    ["self approval", JSON.stringify([{ state: "approved", user: { login: "author" } }]), "backfill", ""],
    ["irreversible owner missing", JSON.stringify([{ state: "approved", user: { login: "independent" } }]), "irreversible", "repo-owner"],
  ])("writes durable JSON/JUnit/human reports for %s", (_name, reviews, classification, owner) => {
    const cwd = mkdtempSync(path.join(tmpdir(), "approval-failure-"));
    const reviewPath = path.join(cwd, "reviews.json");
    if (reviews !== null) writeFileSync(reviewPath, reviews);
    try {
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./capture-production-approval.mjs", import.meta.url)),
        "--reviews", reviewPath,
        "--output", path.join(cwd, "approval.json"),
      ], {
        cwd,
        env: {
          ...process.env,
          GITHUB_ACTOR: "author",
          GITHUB_SHA: commit,
          REQUEST_CLASSIFICATION: classification,
          REQUEST_APPROVAL_DECISION: "Reviewed recovery and irreversible decision.",
          REPOSITORY_OWNER_APPROVER: owner,
        },
      });
      expect(result.status).toBe(1);
      for (const suffix of ["json", "junit.xml", "txt"]) {
        expect(existsSync(path.join(cwd, "tmp/data-reports/production", `production-approval.${suffix}`))).toBe(true);
      }
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves exact request identity and range when evidence validation fails", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "production-prevalidation-failure-"));
    const reportDirectory = path.join(cwd, "reports");
    const requestPath = path.join(cwd, "request.json");
    const approvalPath = path.join(cwd, "approval.json");
    try {
      const request = validPromotionEvidence();
      request.ci.verdict = "fail";
      writeFileSync(requestPath, JSON.stringify(request));
      writeFileSync(approvalPath, "{}\n");
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./production-executor.mjs", import.meta.url)),
        "data", "--request", requestPath, "--approval", approvalPath,
        "--output", path.join(cwd, "evidence.json"), "--report-dir", reportDirectory,
      ], { cwd, env: { ...process.env, ...context } });
      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(path.join(reportDirectory, "production-data-promotion.json"), "utf8"));
      expect(report).toMatchObject({
        verdict: "fail",
        commit,
        target: { environment: "production", ...production },
        migrationRange: request.migrationRange,
        operations: { activeStep: null, attemptedSteps: [], completedSteps: [], results: {} },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("preserves completed and attempted operation results when a later production step fails", () => {
    const cwd = mkdtempSync(path.join(tmpdir(), "production-partial-failure-"));
    const reportDirectory = path.join(cwd, "reports");
    const requestPath = path.join(cwd, "request.json");
    const approvalPath = path.join(cwd, "approval.json");
    const fakeBin = path.join(cwd, "bin");
    const fakePnpm = path.join(fakeBin, "pnpm");
    try {
      mkdirSync(fakeBin);
      writeFileSync(requestPath, JSON.stringify(validPromotionEvidence()));
      writeFileSync(approvalPath, "{}\n");
      writeFileSync(fakePnpm, `#!/bin/sh
case "$*" in
  *"d1 info"*) printf '%s\\n' '[{"uuid":"${production.databaseId}","name":"${production.databaseName}"}]' ;;
  *) exit 23 ;;
esac
`);
      chmodSync(fakePnpm, 0o755);
      const result = spawnSync(process.execPath, [
        fileURLToPath(new URL("./production-executor.mjs", import.meta.url)),
        "data", "--request", requestPath, "--approval", approvalPath,
        "--output", path.join(cwd, "evidence.json"), "--report-dir", reportDirectory,
      ], {
        cwd,
        env: { ...process.env, ...context, PATH: `${fakeBin}:${process.env.PATH}` },
      });
      expect(result.status).toBe(1);
      const report = JSON.parse(readFileSync(path.join(reportDirectory, "production-data-promotion.json"), "utf8"));
      expect(report).toMatchObject({
        verdict: "fail",
        commit,
        target: { environment: "production", ...production },
        operations: {
          activeStep: "recovery-bookmark",
          attemptedSteps: ["identity", "recovery-bookmark"],
          completedSteps: ["identity"],
          results: {
            identity: { verdict: "pass" },
            "recovery-bookmark": { verdict: "fail" },
          },
        },
      });
    } finally {
      rmSync(cwd, { recursive: true, force: true });
    }
  });

  it("runs recovery, reviewed migration, ledger, schema, and invariant gates in order before signing deploy evidence", () => {
    const calls = [];
    const result = runProductionDataPhase({
      commit,
      database: production,
      pendingMigrations: ["0024_safe_template_evolution.sql"],
      run: (step) => {
        calls.push(step);
        return { verdict: "pass", artifact: `${step}.json` };
      },
    });

    expect(calls).toEqual([
      "identity", "recovery-bookmark", "recovery-export", "reviewed-pending-range",
      "pre-invariants", "migration-apply", "ledger-clean", "schema-contract", "post-invariants",
    ]);
    expect(assertDeployEvidence({ signedEvidence: result, commit, database: production })).toMatchObject({
      verdict: "pass",
      commit,
      database: production,
    });
  });

  it("never reaches migration or deploy evidence when a prerequisite fails", () => {
    const calls = [];
    expect(() => runProductionDataPhase({
      commit,
      database: production,
      pendingMigrations: ["0024_safe_template_evolution.sql"],
      run: (step) => {
        calls.push(step);
        return { verdict: step === "pre-invariants" ? "fail" : "pass" };
      },
    })).toThrow(/pre-invariants/i);
    expect(calls).not.toContain("migration-apply");
  });

  it("blocks row/owner loss and nonzero invalid or orphan invariants", () => {
    const values = { users: 2, templates: 4, templates_active: 4, templates_deleted: 0, template_owners: 2, runs: 2, runs_active: 2, runs_deleted: 0, run_owners: 2, templates_invalid_json: 0, templates_invalid_version: 0, runs_invalid_json: 0, orphaned_templates: 0, orphaned_runs: 0, templates_invalid_content_version: 0, runs_invalid_template_version: 0, runs_invalid_revision: 0, runs_invalid_retired_json: 0 };
    const output = JSON.stringify([{ results: Object.entries(values).map(([invariant, total_rows]) => ({ invariant, total_rows })) }]);
    const pre = parseInvariantOutput(output);
    pre.ownershipDigest = "digest";
    const domain = { templates: [], runs: [], emptyRetiredItemsDigest: "empty", digest: "domain" };
    expect(compareProductionInvariants({ pre, post: pre, preDomain: domain, postDomain: domain }).verdict).toBe("pass");
    expect(compareProductionInvariants({ pre, post: { ...pre, templates: 3 }, preDomain: domain, postDomain: domain }).verdict).toBe("fail");
    expect(compareProductionInvariants({ pre, post: { ...pre, orphaned_templates: 1 }, preDomain: domain, postDomain: domain }).verdict).toBe("fail");
    const omitted = { ...pre };
    delete omitted.runs;
    expect(compareProductionInvariants({ pre, post: omitted, preDomain: domain, postDomain: domain }).verdict).toBe("fail");
    expect(compareProductionInvariants({ pre, post: pre }).failures).toContain("per-row domain snapshot omitted");
  });

  it("detects privacy-safe owner and deletion-state swaps without exposing identifiers", () => {
    const key = "protected-owner-digest-key-123456789";
    const before = [{ kind: "template", id: "t1", user_id: "u1", deleted_state: "active" }];
    expect(privacySafeOwnershipDigest({ rows: before, key })).not.toContain("u1");
    expect(privacySafeOwnershipDigest({ rows: before, key })).not.toBe(privacySafeOwnershipDigest({ rows: [{ ...before[0], user_id: "u2" }], key }));
    expect(privacySafeOwnershipDigest({ rows: before, key })).not.toBe(privacySafeOwnershipDigest({ rows: [{ ...before[0], deleted_state: "deleted" }], key }));
  });

  it("rejects forged or tampered deploy evidence", () => {
    const signed = createSignedEvidence({
      payload: { verdict: "pass", commit, database: production, migrationRange: { from: "0024", to: "0024" } },
    });
    signed.payload.commit = "f".repeat(40);
    expect(() => assertDeployEvidence({ signedEvidence: signed, commit, database: production })).toThrow(/digest/i);
  });

  it.each([
    ["data commit", (fixture) => { fixture.signedEvidence.payload.commit = "f".repeat(40); fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["data database", (fixture) => { fixture.signedEvidence.payload.database.databaseId = "22222222-2222-4222-8222-222222222222"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["data range", (fixture) => { fixture.signedEvidence.payload.migrationRange.to = "0025_other.sql"; fixture.signedEvidence.digest = createSignedEvidence({ payload: fixture.signedEvidence.payload }).digest; }],
    ["smoke commit", (fixture) => { fixture.smoke.commit = "f".repeat(40); }],
    ["smoke environment", (fixture) => { fixture.smoke.target.environment = "staging"; }],
    ["smoke database name", (fixture) => { fixture.smoke.target.databaseName = "other"; }],
    ["smoke database id", (fixture) => { fixture.smoke.target.databaseId = "22222222-2222-4222-8222-222222222222"; }],
    ["smoke deployment URL", (fixture) => { fixture.smoke.deploymentUrl = "https://other.pages.dev"; }],
    ["smoke custom domain", (fixture) => { fixture.smoke.customDomain = "https://other.example"; }],
  ])("final production release rejects mismatched %s", (_name, mutate) => {
    const request = validPromotionEvidence();
    const signed = createSignedEvidence({ payload: { verdict: "pass", commit, database: structuredClone(production), migrationRange: structuredClone(request.migrationRange), results: {}, approval: {} } });
    const smoke = { verdict: "pass", commit, target: { environment: "production", ...production }, deploymentUrl: "https://release.pages.dev", customDomain: "https://serplists.com" };
    const fixture = { request, signedEvidence: signed, smoke, deploymentUrl: smoke.deploymentUrl };
    mutate(fixture);
    expect(() => validateFinalProductionRelease(fixture)).toThrow();
  });

  it("final production release accepts only exact signed data and smoke evidence", () => {
    const request = validPromotionEvidence();
    const signedEvidence = createSignedEvidence({ payload: { verdict: "pass", commit, database: production, migrationRange: request.migrationRange, results: {}, approval: {} } });
    const deploymentUrl = "https://release.pages.dev";
    const smoke = { verdict: "pass", commit, target: { environment: "production", ...production }, deploymentUrl, customDomain: "https://serplists.com" };
    expect(validateFinalProductionRelease({ request, signedEvidence, smoke, deploymentUrl })).toMatchObject({ commit, database: production, migrationRange: request.migrationRange });
  });
});
