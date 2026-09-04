import { createHash, timingSafeEqual } from "node:crypto";
export {
  compareProductionInvariants,
  parseInvariantOutput,
  privacySafeOwnershipDigest,
} from "./invariant-capture-lib.mjs";

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
  if (evidence.ciContractCorrection?.verdict !== "pass" || evidence.ciContractCorrection.commit !== evidence.commit ||
      !["pull_request", "push", "workflow_dispatch"].includes(evidence.ciContractCorrection.eventName) || !evidence.ciContractCorrection.comparisonBase) {
    throw new Error("Exact-commit CI contract-correction comparison evidence is missing or untrusted.");
  }
  const schema = evidence.ciSchemaContract;
  if (schema?.verdict !== "pass" || schema.commit !== evidence.commit || schema.runtimeDiff?.verdict !== "pass" ||
      schema.authorityDiff?.verdict !== "pass" || schema.snapshotDiff?.verdict !== "pass" || !schema.migrationRange?.to) {
    throw new Error("Exact-commit full schema-contract evidence is missing or failed.");
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
  if (rehearsal.sanitizedSource?.verdict !== "pass" || rehearsal.sanitizedSource?.attestation?.verdict !== "pass") {
    throw new Error("Rehearsal must prove attested repository-sanitized production-shaped source import.");
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

function normalizeLogin(value) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/^@/, "").toLowerCase() : null;
}

export function validateChangeProvenance({ pulls, commits, expectedCommit }) {
  assertSha(expectedCommit, "Expected change commit");
  const matches = (pulls ?? []).filter((pull) =>
    pull?.merged_at && pull?.base?.ref === "main" && pull?.merge_commit_sha === expectedCommit,
  );
  if (matches.length !== 1) {
    throw new Error("Exact merged main pull request provenance is missing or ambiguous.");
  }
  const pull = matches[0];
  const commitEntries = (commits ?? []).flat();
  const commitLogins = [];
  for (const commit of commitEntries) {
    if (commit?.commit?.verification?.verified !== true) {
      throw new Error("Every pull request commit requires verified GitHub signature provenance.");
    }
    commitLogins.push(commit?.author?.login, commit?.committer?.login);
    for (const match of String(commit?.commit?.message ?? "").matchAll(/^Co-authored-by:\s*(.+)$/gim)) {
      const login = /^@([a-z0-9-]+)$/i.exec(match[1].trim())?.[1];
      if (!login) {
        throw new Error("Pull request commit contains an unresolved co-author identity.");
      }
      commitLogins.push(login);
    }
  }
  const authorLogins = [pull.user?.login, ...commitLogins];
  const normalized = authorLogins.map(normalizeLogin);
  if (!Number.isInteger(pull.number) || !commitEntries.length || normalized.some((login) => !login)) {
    throw new Error("Pull request provenance contains an unresolved human author.");
  }
  return {
    pullRequestNumber: pull.number,
    mergeCommit: expectedCommit,
    changeAuthors: [...new Set(normalized)].sort(),
  };
}

function isProductionHumanApproval(review) {
  return String(review?.state).toLowerCase() === "approved" &&
    review?.user?.type === "User" &&
    (review.environments ?? []).some((environment) => environment?.name === "production");
}

function isProductionOwnerApproval(review) {
  return String(review?.state).toLowerCase() === "approved" &&
    review?.user?.type === "User" &&
    (review.environments ?? []).some((environment) => environment?.name === "production-owner-approval");
}

export function validateApprovalEvidence({
  reviews,
  classification,
  actor,
  changeAuthors,
  repositoryOwnerApprover,
  ownerPermission,
}) {
  const authors = new Set((changeAuthors ?? []).map(normalizeLogin));
  if (!authors.size || authors.has(null)) throw new Error("Verified change author provenance is required.");
  const approved = (reviews ?? []).filter(isProductionHumanApproval);
  const owner = normalizeLogin(repositoryOwnerApprover);
  if (!approved.length) {
    const hasOwnerOnly = classification === "irreversible" &&
      (reviews ?? []).some((review) => isProductionOwnerApproval(review) && normalizeLogin(review.user.login) === owner);
    throw new Error(hasOwnerOnly
      ? "Irreversible migration requires a distinct independent production approver in addition to the repository owner."
      : "Production protected-environment human approval is missing.");
  }
  const independent = approved.find((review) => {
    const login = normalizeLogin(review.user.login);
    return login && !authors.has(login) && (classification !== "irreversible" || login !== owner);
  });
  const approver = normalizeLogin(independent?.user?.login);
  if (!approver) {
    throw new Error(classification === "irreversible"
      ? "Irreversible migration requires a distinct independent production approver in addition to the repository owner."
      : "Independent production approval from a non-author is missing.");
  }
  const decision = String(independent.comment ?? "").trim();
  if (["backfill", "destructive", "irreversible"].includes(classification) && decision.length < 20) {
    throw new Error(`${classification} approval requires a written production review decision and recovery evidence.`);
  }
  if (classification === "irreversible") {
    const permissionLogin = normalizeLogin(ownerPermission?.user?.login);
    if (!owner || permissionLogin !== owner || ownerPermission?.permission !== "admin") {
      throw new Error("Irreversible migration requires a verified repository-admin owner identity.");
    }
    if (authors.has(owner)) throw new Error("Irreversible repository-owner approver cannot be a change author.");
    const ownerReview = (reviews ?? []).filter(isProductionOwnerApproval)
      .find((review) => normalizeLogin(review.user.login) === owner);
    if (!ownerReview) throw new Error("Irreversible migration requires repository-owner approval bound to production.");
    if (owner === approver) throw new Error("Irreversible migration requires a distinct additional repository-owner approver.");
  }
  return {
    approver,
    dispatcher: normalizeLogin(actor),
    changeAuthors: [...authors].sort(),
    classification,
    decision,
    environment: "production",
    ...(classification === "irreversible" ? { repositoryOwnerApprover: owner } : {}),
    source: "github-environment-review",
  };
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
