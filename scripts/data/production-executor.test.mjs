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

  it("requires exact passing CI and rehearsal evidence for the requested commit and migration range", () => {
    const evidence = {
      commit,
      classification: "backfill",
      database: production,
      migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
      ci: { verdict: "pass", commit, workingTreeDirty: false },
      rehearsal: {
        verdict: "pass",
        commit,
        target: { environment: "rehearsal", databaseId: "11111111-1111-4111-8111-111111111111" },
        migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" },
        recovery: { verdict: "pass" },
        teardown: { verdict: "pass" },
      },
    };

    expect(validatePromotionEvidence(evidence)).toEqual(evidence);
    for (const invalid of [
      { ...evidence, classification: "unclassified" },
      { ...evidence, ci: { ...evidence.ci, verdict: "fail" } },
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
      rehearsal: { verdict: "pass", commit, target: { environment: "staging", databaseId: "staging" }, migrationRange: { from: null, to: null }, recovery: { verdict: "pass" }, teardown: { verdict: "pass" } },
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
    expect(assertMigrationClassification({ requested: "backfill", sqlTexts: ["ALTER TABLE x ADD COLUMN y TEXT; UPDATE x SET y='a';"] })).toBe("backfill");
    expect(() => assertMigrationClassification({ requested: "additive", sqlTexts: ["DELETE FROM x;"] })).toThrow(/destructive/i);
  });

  it("requires an independent recorded human approval and higher-risk decision evidence", () => {
    const reviews = [{ state: "approved", user: { login: "independent-reviewer" } }];
    expect(validateApprovalEvidence({ reviews, classification: "backfill", actor: "author", decision: "Reviewed recovery and invariants.", environment: "production" }).approver).toBe("independent-reviewer");
    expect(() => validateApprovalEvidence({ reviews, classification: "destructive", actor: "author", decision: "", environment: "production" })).toThrow(/decision/i);
    expect(() => validateApprovalEvidence({ reviews: [{ state: "approved", user: { login: "author" } }], classification: "additive", actor: "author", decision: "approved", environment: "production" })).toThrow(/independent/i);
    expect(() => validateApprovalEvidence({ reviews, classification: "irreversible", actor: "author", decision: "Reviewed irreversible recovery decision.", environment: "production", repositoryOwnerApprover: "repo-owner" })).toThrow(/repository-owner/i);
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
    expect(compareProductionInvariants({ pre, post: pre }).verdict).toBe("pass");
    expect(compareProductionInvariants({ pre, post: { ...pre, templates: 3 } }).verdict).toBe("fail");
    expect(compareProductionInvariants({ pre, post: { ...pre, orphaned_templates: 1 } }).verdict).toBe("fail");
    const omitted = { ...pre };
    delete omitted.runs;
    expect(compareProductionInvariants({ pre, post: omitted }).verdict).toBe("fail");
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
