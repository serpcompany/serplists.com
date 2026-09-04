import { spawnSync } from "node:child_process";
import { existsSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
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
    const evidence = {
      commit,
      classification: "backfill",
      database: production,
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      ci: { verdict: "pass", commit, workingTreeDirty: false },
      ciContractCorrection: { verdict: "pass", commit, eventName: "push", comparisonBase: "base-sha" },
      ciSchemaContract: { verdict: "pass", commit, runtimeDiff: { verdict: "pass" }, authorityDiff: { verdict: "pass" }, snapshotDiff: { verdict: "pass" }, migrationRange: { from: "0001_initial_schema.sql", to: "0024_safe_template_evolution.sql" } },
      rehearsal: {
        verdict: "pass",
        commit,
        target: { environment: "rehearsal", databaseId: "11111111-1111-4111-8111-111111111111" },
        migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
        recovery: { verdict: "pass" },
        teardown: { verdict: "pass" },
        sanitizedSource: { verdict: "pass", attestation: { verdict: "pass" } },
      },
    };

    expect(validatePromotionEvidence(evidence)).toEqual(evidence);
    for (const invalid of [
      { ...evidence, classification: "unclassified" },
      { ...evidence, ci: { ...evidence.ci, verdict: "fail" } },
      { ...evidence, ciContractCorrection: { ...evidence.ciContractCorrection, eventName: "local-working-tree" } },
      { ...evidence, ciContractCorrection: { ...evidence.ciContractCorrection, comparisonBase: null } },
      { ...evidence, ciSchemaContract: { ...evidence.ciSchemaContract, authorityDiff: { verdict: "fail" } } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, commit: "f".repeat(40) } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, target: { environment: "production", databaseId: production.databaseId } } },
      { ...evidence, rehearsal: { ...evidence.rehearsal, recovery: { verdict: "fail" } } },
    ]) expect(() => validatePromotionEvidence(invalid)).toThrow();
  });

  it("supports an explicit no-migrations release only with a proven clean ledger", () => {
    const evidence = {
      commit, classification: "additive", database: production,
      migrationRange: { from: null, to: null }, pendingMigrations: [],
      ci: { verdict: "pass", commit, workingTreeDirty: false },
      ciContractCorrection: { verdict: "pass", commit, eventName: "push", comparisonBase: "base-sha" },
      ciSchemaContract: { verdict: "pass", commit, runtimeDiff: { verdict: "pass" }, authorityDiff: { verdict: "pass" }, snapshotDiff: { verdict: "pass" }, migrationRange: { from: "0001_initial_schema.sql", to: "0024_safe_template_evolution.sql" } },
      rehearsal: { verdict: "pass", commit, target: { environment: "staging", databaseId: "staging" }, migrationRange: { from: null, to: null }, recovery: { verdict: "pass" }, teardown: { verdict: "pass" }, sanitizedSource: { verdict: "pass", attestation: { verdict: "pass" } } },
    };
    expect(validatePromotionEvidence(evidence).pendingMigrations).toEqual([]);
  });

  it("rejects artifacts unless GitHub identifies the exact successful workflow and commit", () => {
    const metadata = { id: 123, head_sha: commit, conclusion: "success", name: "CI", event: "push", repository: { full_name: "serpcompany/serplists.com" } };
    expect(validateGitHubRunEvidence({ metadata, commit, workflowName: "CI" })).toEqual(metadata);
    for (const invalid of [
      { ...metadata, head_sha: "f".repeat(40) },
      { ...metadata, conclusion: "failure" },
      { ...metadata, name: "Untrusted workflow" },
      { ...metadata, repository: { full_name: "other/repo" } },
    ]) expect(() => validateGitHubRunEvidence({ metadata: invalid, commit, workflowName: "CI" })).toThrow();
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

  it("derives exact main PR and all human authors from GitHub change provenance", () => {
    const pulls = [{ number: 100, merged_at: "2026-09-05T00:00:00Z", merge_commit_sha: commit, base: { ref: "main" }, user: { login: "PR-Author" } }];
    const commits = [
      { author: { login: "commit-author" }, committer: { login: "trusted-committer" }, commit: { message: "Change\n\nCo-authored-by: @co-author", verification: { verified: true } } },
      { author: { login: "pr-author" }, committer: { login: "trusted-committer" }, commit: { message: "Other", verification: { verified: true } } },
    ];
    expect(validateChangeProvenance({ pulls, commits, expectedCommit: commit })).toEqual({ pullRequestNumber: 100, mergeCommit: commit, changeAuthors: ["co-author", "commit-author", "pr-author", "trusted-committer"] });
    expect(() => validateChangeProvenance({ pulls: [], commits, expectedCommit: commit })).toThrow(/pull request/i);
    expect(() => validateChangeProvenance({ pulls: [{ ...pulls[0], base: { ref: "staging" } }], commits, expectedCommit: commit })).toThrow(/pull request/i);
    expect(() => validateChangeProvenance({ pulls, commits: [{ author: null, committer: { login: "committer" }, commit: { message: "Change", verification: { verified: true } } }], expectedCommit: commit })).toThrow(/author/i);
    expect(() => validateChangeProvenance({ pulls, commits: [{ author: { login: "author" }, committer: { login: "committer" }, commit: { message: "Change", verification: { verified: false } } }], expectedCommit: commit })).toThrow(/verified/i);
    expect(() => validateChangeProvenance({ pulls, commits: [{ author: { login: "author" }, committer: { login: "committer" }, commit: { message: "Change\n\nCo-authored-by: Person <private@example.test>", verification: { verified: true } } }], expectedCommit: commit })).toThrow(/co-author/i);
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
});
