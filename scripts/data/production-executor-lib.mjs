import { createHash, createHmac, timingSafeEqual } from "node:crypto";

const REQUIRED_CONTEXT = {
  GITHUB_ACTIONS: "true",
  GITHUB_REPOSITORY: "serpcompany/serplists.com",
  GITHUB_EVENT_NAME: "workflow_dispatch",
  GITHUB_REF: "refs/heads/main",
  GITHUB_REF_PROTECTED: "true",
  DATA_PROTECTED_ENVIRONMENT: "production",
};
const RISK = ["additive", "backfill", "destructive", "irreversible"];

export function assertMigrationClassification({ requested, sqlTexts }) {
  let derived = "additive";
  const sql = sqlTexts.join("\n").replace(/^\s*--.*$/gm, " ");
  if (/\b(update|insert|replace)\b/i.test(sql)) derived = "backfill";
  if (/\b(drop|delete|alter\s+table\s+\S+\s+(rename|drop))\b/i.test(sql)) derived = "destructive";
  if (!RISK.includes(requested) || RISK.indexOf(requested) < RISK.indexOf(derived)) {
    throw new Error(`Migration range is at least ${derived}; requested classification ${requested ?? "missing"} is unsafe.`);
  }
  return derived;
}

function assertSha(value, label) {
  if (!/^[0-9a-f]{40}$/.test(value ?? "")) throw new Error(`${label} must be an exact 40-character commit SHA.`);
}

export function assertProductionWorkflowContext({ env, expectedCommit }) {
  for (const [name, expected] of Object.entries(REQUIRED_CONTEXT)) {
    if (env?.[name] !== expected) throw new Error(`Production workflow context requires ${name}=${expected}.`);
  }
  assertSha(expectedCommit, "Expected commit");
  if (env.GITHUB_SHA !== expectedCommit) throw new Error("Production workflow commit does not match the reviewed commit.");
  if (!/^\d+$/.test(env.GITHUB_RUN_ID ?? "") || !/^\d+$/.test(env.GITHUB_RUN_ATTEMPT ?? "")) {
    throw new Error("Production workflow requires GitHub-generated run identity.");
  }
  if (!env.CLOUDFLARE_API_TOKEN || env.CLOUDFLARE_API_KEY || env.CLOUDFLARE_EMAIL) {
    throw new Error("Production requires one protected, scoped CLOUDFLARE_API_TOKEN and rejects legacy global-key credentials.");
  }
  if ((env.PRODUCTION_BACKUP_ENCRYPTION_KEY ?? "").length < 32) {
    throw new Error("Protected production backup encryption key is missing.");
  }
  return {
    repository: env.GITHUB_REPOSITORY,
    runId: env.GITHUB_RUN_ID,
    runAttempt: env.GITHUB_RUN_ATTEMPT,
    commit: env.GITHUB_SHA,
    protectedEnvironment: env.DATA_PROTECTED_ENVIRONMENT,
  };
}

export function assertProductionArtifactContext({ env, expectedCommit }) {
  for (const [name, expected] of Object.entries(REQUIRED_CONTEXT)) {
    if (env?.[name] !== expected) throw new Error(`Production artifact context requires ${name}=${expected}.`);
  }
  assertSha(expectedCommit, "Expected commit");
  if (env.GITHUB_SHA !== expectedCommit || !/^\d+$/.test(env.GITHUB_RUN_ID ?? "")) {
    throw new Error("Production artifact context does not match the exact GitHub run and commit.");
  }
  return { repository: env.GITHUB_REPOSITORY, runId: env.GITHUB_RUN_ID, commit: env.GITHUB_SHA };
}

export function validatePromotionEvidence(evidence) {
  assertSha(evidence?.commit, "Promotion commit");
  if (!["additive", "backfill", "destructive", "irreversible"].includes(evidence.classification)) {
    throw new Error("Production migration classification is missing or invalid.");
  }
  if (!evidence.database?.databaseName || !evidence.database?.databaseId) throw new Error("Production database identity is incomplete.");
  const noMigrations = evidence.migrationRange?.from == null && evidence.migrationRange?.to == null && Array.isArray(evidence.pendingMigrations) && evidence.pendingMigrations.length === 0;
  if (!noMigrations && (!evidence.migrationRange?.from || !evidence.migrationRange?.to)) throw new Error("Reviewed migration range is incomplete.");
  if (evidence.ci?.verdict !== "pass" || evidence.ci.commit !== evidence.commit || evidence.ci.workingTreeDirty) {
    throw new Error("Exact-commit CI data-regression evidence is missing or failed.");
  }
  const rehearsal = evidence.rehearsal;
  if (rehearsal?.verdict !== "pass" || rehearsal.commit !== evidence.commit) throw new Error("Exact-commit rehearsal evidence is missing or failed.");
  if (!['rehearsal', 'staging'].includes(rehearsal.target?.environment) || rehearsal.target.databaseId === evidence.database.databaseId) {
    throw new Error("Rehearsal evidence must come from an isolated non-production database.");
  }
  if (rehearsal.migrationRange?.from !== evidence.migrationRange.from || rehearsal.migrationRange?.to !== evidence.migrationRange.to) {
    throw new Error("Rehearsal migration range does not match the reviewed production range.");
  }
  if (rehearsal.recovery?.verdict !== "pass" || rehearsal.teardown?.verdict !== "pass") {
    throw new Error("Rehearsal recovery and teardown evidence must pass.");
  }
  return evidence;
}

export function validateGitHubRunEvidence({ metadata, commit, workflowName }) {
  if (metadata?.repository?.full_name !== "serpcompany/serplists.com" || metadata.head_sha !== commit ||
      metadata.conclusion !== "success" || metadata.name !== workflowName || !Number.isInteger(metadata.id)) {
    throw new Error(`GitHub run is not successful exact-commit evidence from ${workflowName}.`);
  }
  return metadata;
}

export function validateApprovalEvidence({ reviews, classification, actor, decision, environment, repositoryOwnerApprover }) {
  if (environment !== "production") throw new Error("Approval evidence must be bound to the production environment.");
  const approved = (reviews ?? []).find((review) => review?.state === "approved" && (review.user?.login ?? review.reviewer?.login) !== actor);
  const approver = approved?.user?.login ?? approved?.reviewer?.login;
  if (!approver) throw new Error("Independent protected-environment human approval is missing.");
  if (["backfill", "destructive", "irreversible"].includes(classification) && String(decision ?? "").trim().length < 20) {
    throw new Error(`${classification} approval requires written decision and recovery evidence.`);
  }
  const approvedLogins = (reviews ?? []).filter((review) => review?.state === "approved").map((review) => review.user?.login ?? review.reviewer?.login);
  if (classification === "irreversible" && (!repositoryOwnerApprover || !approvedLogins.includes(repositoryOwnerApprover))) {
    throw new Error("Irreversible migration requires separate repository-owner approval.");
  }
  return { approver, actor, classification, decision, environment, ...(classification === "irreversible" ? { repositoryOwnerApprover } : {}), source: "github-environment-review" };
}

export function parseInvariantOutput(output) {
  const parsed = JSON.parse(output);
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry?.results ?? []);
  const values = Object.fromEntries(rows.filter((row) => typeof row?.invariant === "string").map((row) => [row.invariant, Number(row.total_rows)]));
  if (!Object.keys(values).length || Object.values(values).some((value) => !Number.isFinite(value))) throw new Error("Production invariant output is missing or malformed.");
  return values;
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

export function privacySafeOwnershipDigest({ rows, key }) {
  if ((key ?? "").length < 32 || !Array.isArray(rows)) throw new Error("Ownership digest requires protected key and rows.");
  const canonical = rows.map((row) => [String(row.kind), String(row.id), String(row.user_id), String(row.deleted_state)].join("\u001f")).sort().join("\n");
  return createHmac("sha256", key).update(canonical).digest("hex");
}

function signatureFor(payload) {
  return createHash("sha256").update(JSON.stringify(payload)).digest("hex");
}

export function createSignedEvidence({ payload }) {
  return { payload: structuredClone(payload), digest: signatureFor(payload), provenance: "requires-github-artifact-attestation" };
}

export function verifySignedEvidence({ signedEvidence }) {
  const expected = Buffer.from(signatureFor(signedEvidence?.payload), "hex");
  const actual = Buffer.from(String(signedEvidence?.digest ?? ""), "hex");
  if (expected.length !== actual.length || !timingSafeEqual(expected, actual)) throw new Error("Production evidence digest is invalid.");
  return signedEvidence.payload;
}

export function runProductionDataPhase({ commit, database, pendingMigrations, approval = null, run }) {
  const steps = [
    "identity", "recovery-bookmark", "recovery-export", "reviewed-pending-range",
    "pre-invariants", "migration-apply", "ledger-clean", "schema-contract", "post-invariants",
  ];
  const results = {};
  for (const step of steps) {
    const result = run(step);
    if (result?.verdict !== "pass") throw new Error(`Production ${step} gate failed.`);
    results[step] = result;
  }
  const payload = {
    verdict: "pass",
    commit,
    database,
    migrationRange: {
      from: pendingMigrations[0] ?? null,
      to: pendingMigrations.at(-1) ?? null,
    },
    approval,
    results,
  };
  return createSignedEvidence({ payload });
}

export function assertDeployEvidence({ signedEvidence, commit, database }) {
  const payload = verifySignedEvidence({ signedEvidence });
  if (payload.verdict !== "pass" || payload.commit !== commit ||
      payload.database?.databaseName !== database.databaseName || payload.database?.databaseId !== database.databaseId) {
    throw new Error("Signed production data evidence does not authorize this exact deploy.");
  }
  return payload;
}
