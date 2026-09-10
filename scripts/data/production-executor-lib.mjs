import { createHash, timingSafeEqual } from "node:crypto";
import { validateAuthenticatedCandidateEvidence } from "./authenticated-coverage-lib.mjs";
import { validateSanitizedStateBinding, validateSanitizedCohortProof } from './sanitized-state-lib.mjs';
import { validateControlledCanaryChecks } from "./deployment-smoke-lib.mjs";
import { assertProductionKeySeparation } from "./production-key-separation-lib.mjs";
import { normalizeMigrationRange, migrationRangesEqual, migrationsInRange } from "./migration-range-lib.mjs";
import { evaluateInvariantLedgerTransition } from "./remote-invariant-evidence-lib.mjs";
import { assertRecoveryApproval, assertRecoveryFreshness, assertRepositoryAppliedPrefix, digest, repositoryMigrationHistory, REQUIRED_PRODUCTION_STEPS, EXECUTION_STEPS, IDENTITY_BOUND_STEPS, assertProductionStepSummary, hasSha256 } from "./production-preparation-lib.mjs";
import { wrapCanarySubprocessFailure } from './canary-diagnostics.mjs';
import { assertSourceSchemaProof } from './source-schema-proof.mjs';
import { assertInvariantSafetySummary, assertInvariantSummaryTransition } from './invariant-capture-lib.mjs';
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

function sqlStatements(sqlTexts) {
  const source = sqlTexts.join("\n");
  const statements = [];
  let current = "";
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];
    if (lineComment) {
      if (character === "\n") lineComment = false;
      continue;
    }
    if (blockComment) {
      if (character === "*" && next === "/") {
        blockComment = false;
        index += 1;
      }
      continue;
    }
    if (!quote && character === "-" && next === "-") {
      current += " ";
      lineComment = true;
      index += 1;
      continue;
    }
    if (!quote && character === "/" && next === "*") {
      current += " ";
      blockComment = true;
      index += 1;
      continue;
    }
    if (quote) {
      current += character;
      if (character === quote) {
        if (quote !== "]" && next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (["'", '"', "`", "["].includes(character)) {
      quote = character === "[" ? "]" : character;
      current += character;
      continue;
    }
    if (character === ";") {
      if (current.trim()) statements.push(current.trim());
      current = "";
      continue;
    }
    current += character;
  }
  if (quote || blockComment) throw new Error("Migration SQL is unterminated; classification fails closed as irreversible.");
  if (current.trim()) statements.push(current.trim());
  return statements;
}

function statementRisk(statement) {
  const normalized = statement.replace(/\s+/g, " ").trim();
  if (/^(begin(?: transaction)?|commit|end(?: transaction)?|rollback)$/i.test(normalized)) return "additive";
  if (/^pragma\s+defer_foreign_keys\s*=\s*(?:true|false|on|off|0|1)$/i.test(normalized)) return "additive";
  if (/^pragma\s+foreign_keys\s*=\s*(?:true|on|1)$/i.test(normalized)) return "additive";
  if (/^pragma\s+foreign_keys\s*=\s*(?:false|off|0)$/i.test(normalized)) return "destructive";
  if (/^create\s+table\b/i.test(normalized)) {
    const schemaDefinition = /^create\s+table\s+(?:if\s+not\s+exists\s+)?(?:"(?:[^"]|"")+"|`(?:[^`]|``)+`|\[[^\]]+\]|[a-z_][a-z0-9_$]*(?:\.[a-z_][a-z0-9_$]*)?)\s*\(/i.test(normalized);
    return schemaDefinition ? "additive" : "backfill";
  }
  if (/^create\s+(?!unique\b)index\b/i.test(normalized)) return "additive";
  if (/^alter\s+table\s+\S+\s+add\s+(?:column\s+)?/i.test(normalized)) {
    const required = /\bnot\s+null\b/i.test(normalized);
    const safeDefault = /\bdefault\s+(?!null\b)(?:[-+]?\d+(?:\.\d+)?|'(?:''|[^'])*'|"(?:""|[^"])*")\s*$/i.test(normalized);
    return required && !safeDefault ? "destructive" : "additive";
  }
  // SQLite REPLACE conflict resolution can delete a conflicting row for either
  // INSERT or UPDATE and cascade foreign-key deletes. Classify the operation
  // prefix before ordinary writes, regardless of the target identifier syntax.
  if (/^replace\b/i.test(normalized) || /^(?:insert|update)\s+or\s+replace\b/i.test(normalized)) return "destructive";
  if (/^(insert|update)\b/i.test(normalized)) return "backfill";
  if (/^(delete|drop)\b/i.test(normalized) || /^alter\s+table\b/i.test(normalized) || /^create\s+unique\s+index\b/i.test(normalized)) {
    return "destructive";
  }
  return "irreversible";
}

export function assertMigrationClassification({ requested, sqlTexts }) {
  const statements = sqlStatements(sqlTexts);
  if (!statements.length) {
    if (sqlTexts.length === 0 && requested === "additive") return "additive";
    throw new Error("Migration SQL has no classifiable statements; classification fails closed as irreversible.");
  }
  const derived = statements.reduce((highest, statement) => {
    const risk = statementRisk(statement);
    return RISK.indexOf(risk) > RISK.indexOf(highest) ? risk : highest;
  }, "additive");
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
  assertProductionKeySeparation(env);
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
  if (!evidence || typeof evidence !== 'object' || Array.isArray(evidence)) throw new Error('A complete production request is required.');
  evidence.migrationRange = normalizeMigrationRange(evidence?.migrationRange);
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
  evidence.ci.migrationRange = normalizeMigrationRange(evidence.ci.migrationRange);
  const ciCoverage = evidence.ci?.coverage;
  const rehearsalCoverage = evidence.rehearsal?.coverage;
  if (ciCoverage?.verdict !== "pass" || !ciCoverage.planId || !/^[0-9a-f]{64}$/.test(ciCoverage.declarationSha256 ?? "") || !Array.isArray(ciCoverage.affectedTables) || !ciCoverage.affectedTables.length || !Array.isArray(ciCoverage.invariants) || !ciCoverage.invariants.length || JSON.stringify(ciCoverage) !== JSON.stringify(rehearsalCoverage)) {
    throw new Error("CI and rehearsal affected-domain coverage is missing or inconsistent.");
  }
  if (evidence.ciContractCorrection?.verdict !== "pass" || evidence.ciContractCorrection.commit !== evidence.commit ||
      evidence.ciContractCorrection.eventName !== "push" || evidence.ciContractCorrection.comparisonBase !== evidence.mergeContext?.baseCommit) {
    throw new Error("Exact-commit CI contract-correction comparison evidence is missing or untrusted.");
  }
  validateGitHubRunEvidence({ metadata: evidence.ciRun, commit: evidence.commit, workflowName: "CI", eventName: "push", headBranch: "main", workflowPath: ".github/workflows/ci.yml" });
  const schema = evidence.ciSchemaContract;
  if (schema?.verdict !== "pass" || schema.commit !== evidence.commit || schema.runtimeDiff?.verdict !== "pass" ||
      schema.authorityDiff?.verdict !== "pass" || schema.snapshotDiff?.verdict !== "pass" || !schema.migrationRange?.to) {
    throw new Error("Exact-commit full schema-contract evidence is missing or failed.");
  }
  const rehearsal = evidence.rehearsal;
  if (rehearsal?.verdict !== "pass" || rehearsal.commit !== evidence.commit) throw new Error("Exact-commit rehearsal evidence is missing or failed.");
  rehearsal.migrationRange = normalizeMigrationRange(rehearsal.migrationRange);
  if (!['rehearsal', 'staging'].includes(rehearsal.target?.environment) || rehearsal.target.databaseId === evidence.database.databaseId) {
    throw new Error("Rehearsal evidence must come from an isolated non-production database.");
  }
  if (!migrationRangesEqual(rehearsal.migrationRange, evidence.migrationRange)) {
    throw new Error("Rehearsal migration range does not match the reviewed production range.");
  }
  if (!migrationRangesEqual(evidence.ci.migrationRange, evidence.migrationRange)) throw new Error("CI migration range does not match the reviewed production range.");
  if (rehearsal.recovery?.verdict !== "pass" || rehearsal.teardown?.verdict !== "pass") {
    throw new Error("Rehearsal recovery and teardown evidence must pass.");
  }
  if (rehearsal.sanitizedSource?.verdict !== "pass" || rehearsal.sanitizedSource?.attestation?.verdict !== "pass") {
    throw new Error("Rehearsal must prove attested repository-sanitized production-shaped source import.");
  }
  const authenticated = rehearsal.authenticatedRehearsal;
  validateAuthenticatedCandidateEvidence(authenticated, { requireDetectors: true });
  const invariants = rehearsal.remoteRehearsal?.invariants;
  if (!authenticated.postMigrationState?.cohort || !invariants?.sanitizedState?.cohort ||
      !rehearsal.sanitizedSource.selection?.selectedCounts || !Array.isArray(rehearsal.sanitizedSource.selection.profileExclusions)) {
    throw new Error('Authenticated source cohort and manifest selection are required.');
  }
  validateSanitizedStateBinding(authenticated.postMigrationState, invariants?.sanitizedState);
  validateSanitizedCohortProof(authenticated.cohortProof, { state: invariants.sanitizedState, selection: rehearsal.sanitizedSource.selection });
  const source = rehearsal.sanitizedSource;
  if (authenticated.target?.environment !== 'local' || authenticated.transformation?.verdict !== 'pass' || authenticated.handlerStateReadback !== true ||
      authenticated.postMigrationState.sourceSha256 !== source.artifactSha256 || !source.sourceProfile ||
      JSON.stringify(authenticated.sourceProfile) !== JSON.stringify(source.sourceProfile) || !hasSha256(source.manifestIntegritySha256) ||
      authenticated.manifestIntegritySha256 !== source.manifestIntegritySha256) {
    throw new Error('Authenticated cohort source, manifest, transformation, or handler state binding is missing or mismatched.');
  }
  const remote = rehearsal.remoteRehearsal;
  if (invariants.verdict !== 'pass' || invariants.commit !== evidence.commit || invariants.comparisonKind !== 'migration' ||
      JSON.stringify(remote.target) !== JSON.stringify(rehearsal.target) || JSON.stringify(invariants.target) !== JSON.stringify(rehearsal.target) ||
      !migrationRangesEqual(remote.migrationRange, evidence.migrationRange) || !migrationRangesEqual(invariants.migrationRange, evidence.migrationRange)) {
    throw new Error('Independent rehearsal state is not bound to the exact commit, target, and reviewed range.');
  }
  const expectedLedger = repositoryMigrationHistory();
  const pending = migrationsInRange(expectedLedger, evidence.migrationRange);
  if (!Array.isArray(evidence.pendingMigrations) || JSON.stringify(evidence.pendingMigrations) !== JSON.stringify(pending)) {
    throw new Error('Production request pending migrations do not match the reviewed range.');
  }
  const expectedBefore = expectedLedger.slice(0, expectedLedger.length - pending.length);
  if (invariants.ledger?.verdict !== 'pass' || JSON.stringify(invariants.ledger.before) !== JSON.stringify(expectedBefore) ||
      JSON.stringify(invariants.ledger.after) !== JSON.stringify(expectedLedger) ||
      JSON.stringify(authenticated.postMigrationState.ledger) !== JSON.stringify(expectedLedger) ||
      authenticated.postMigrationState.ledgerSha256 !== invariants.ledger.afterSha256) {
    throw new Error('Authenticated cohort state must bind the complete exact candidate ledger and reviewed transition.');
  }
  authenticated.migrationRange = normalizeMigrationRange(authenticated.migrationRange);
  if (authenticated.commit !== evidence.commit || authenticated.sanitizerArtifactSha256 !== rehearsal.sanitizedSource.artifactSha256 || !migrationRangesEqual(authenticated.migrationRange, evidence.migrationRange)) throw new Error("Authenticated sanitized candidate-handler evidence is missing or mismatched.");
  const staging = evidence.staging;
  if (staging) staging.migrationRange = normalizeMigrationRange(staging.migrationRange);
  // Staging can already be at the candidate schema while production is behind.
  // Its own range must still have exact data coverage and an ordered transition.
  if (!migrationRangesEqual(staging?.migrationRange, evidence.migrationRange)) {
    const transition = evaluateInvariantLedgerTransition({ before: staging?.invariants?.ledger?.before ?? [], after: staging?.invariants?.ledger?.after ?? [], expectedRange: staging?.migrationRange, expectedMigrations: staging?.pendingMigrations ?? [], comparisonKind: "migration" });
    if (!migrationRangesEqual(staging?.data?.migrationRange, staging?.migrationRange) || !migrationRangesEqual(staging?.invariants?.migrationRange, staging?.migrationRange) || staging?.data?.coverage?.verdict !== "pass" || staging?.invariants?.ledger?.verdict !== "pass" || transition.verdict !== "pass" || staging?.invariants?.ledger?.after?.at(-1) !== schema.migrationRange.to) throw new Error("Staging range evidence does not prove the candidate schema and its actual ledger transition.");
  }
  const provenance = evidence.changeProvenance;
  if (evidence.mergeContext?.commit !== evidence.commit || !/^[0-9a-f]{40}$/.test(evidence.mergeContext?.tree ?? "") ||
      provenance?.mergeCommit !== evidence.commit || staging?.commit !== provenance?.pullRequestHeadCommit ||
      staging?.tree !== evidence.mergeContext.tree || staging?.verdict !== "pass" || staging?.target?.environment !== "staging" ||
      staging?.target?.databaseId === evidence.database.databaseId || staging?.data?.verdict !== "pass" ||
      staging?.schema?.verdict !== "pass" || staging?.schema?.ledger?.verdict !== "pass" || staging?.invariants?.verdict !== "pass" ||
      staging?.deploy?.verdict !== "pass" || staging?.smoke?.verdict !== "pass" || !Array.isArray(staging?.smoke?.failures) ||
      staging.smoke.failures.length || staging?.teardown?.verdict !== "pass") {
    throw new Error("Exact-tree staging data, deploy, smoke, and teardown evidence is missing or failed.");
  }
  validateControlledCanaryChecks(staging.smoke);
  validateGitHubRunEvidence({ metadata: evidence.stagingRun, commit: staging.commit, workflowName: "Protected data promotion and Pages deploy", eventName: "push", headBranch: "staging", workflowPath: ".github/workflows/cloudflare-pages-deploy.yml" });
  return evidence;
}

export function validateGitHubRunEvidence({ metadata, commit, workflowName, eventName, headBranch, workflowPath }) {
  if (metadata?.repository?.full_name !== "serpcompany/serplists.com" || (commit && metadata.head_sha !== commit) ||
      metadata.conclusion !== "success" || metadata.name !== workflowName ||
      (eventName && metadata.event !== eventName) || (headBranch && metadata.head_branch !== headBranch) ||
      (workflowPath && metadata.path !== workflowPath) || !Number.isInteger(metadata.id)) {
    throw new Error(`GitHub run is not successful exact-commit evidence from ${workflowName}.`);
  }
  return metadata;
}

function normalizeLogin(value) {
  return typeof value === "string" && value.trim() ? value.trim().replace(/^@/, "").toLowerCase() : null;
}

export function assertApprovalMatchesRequest({ approval, request }) {
  if (approval?.environment !== "production" || approval?.source !== "github-environment-review") throw new Error("Production request lacks protected-environment approval evidence.");
  const approver = normalizeLogin(approval.approver);
  const authors = new Set((approval.changeAuthors ?? []).map(normalizeLogin));
  const expectedAuthors = [...new Set((request?.changeProvenance?.changeAuthors ?? []).map(normalizeLogin))].sort();
  if (!approver || !authors.size || authors.has(null) || authors.has(approver)) throw new Error("Production approval is not independent of every change author.");
  if (request?.classification !== approval.classification || JSON.stringify([...authors].sort()) !== JSON.stringify(expectedAuthors)) throw new Error("Production approval classification or change authors do not match the reviewed request.");
  const reference = approval.reviewReference;
  if (reference?.repository !== "serpcompany/serplists.com" || !/^\d+$/.test(reference?.runId ?? "") || !/^\d+$/.test(reference?.runAttempt ?? "") || !/^[0-9a-f]{40}$/.test(reference?.commit ?? '') || reference?.commit !== request?.commit || reference?.environment !== "production") {
    throw new Error("Production approval lacks its canonical protected review reference.");
  }
  if (["backfill", "destructive", "irreversible"].includes(request.classification) &&
      (approval.riskDecision?.policy !== "meaningful-written-risk-reason-v1" ||
       !/^[0-9a-f]{64}$/.test(approval.riskDecision?.sha256 ?? "") ||
       !Number.isInteger(approval.riskDecision?.characterCount) || !Number.isInteger(approval.riskDecision?.wordCount) ||
       approval.riskDecision?.characterCount < 20 || approval.riskDecision?.wordCount < 3 ||
       !/^[0-9a-f]{64}$/.test(approval.decisionSha256 ?? ""))) {
    throw new Error("Production approval lacks the written risky-change decision required by the reviewed request.");
  }
  return approval;
}

export function validateChangeProvenance({ pulls, commits, commitAuthors, mergeCommit, mergeAuthors, expectedCommit }) {
  assertSha(expectedCommit, "Expected change commit");
  const matches = (pulls ?? []).filter((pull) =>
    pull?.merged_at && pull?.base?.ref === "main" && pull?.merge_commit_sha === expectedCommit,
  );
  if (matches.length !== 1) {
    throw new Error("Exact merged main pull request provenance is missing or ambiguous.");
  }
  const pull = matches[0];
  if (!/^[0-9a-f]{40}$/.test(pull.head?.sha ?? "")) {
    throw new Error("Exact merged main pull request head commit provenance is missing.");
  }
  if (mergeCommit?.sha !== expectedCommit || mergeCommit?.commit?.verification?.verified !== true) {
    throw new Error("Exact merged main commit requires verified GitHub merge provenance.");
  }
  const mergeAuthor = normalizeLogin(mergeCommit.author?.login);
  const mergeCommitter = normalizeLogin(mergeCommit.committer?.login);
  if (!mergeAuthor || !mergeCommitter) {
    throw new Error("Exact merged main commit requires attributed GitHub author and committer provenance.");
  }
  const mergeAuthorNode = mergeAuthors?.data?.repository?.object;
  const mergeAuthorNodes = mergeAuthorNode?.authors?.nodes;
  const mergeAuthorLogins = Array.isArray(mergeAuthorNodes)
    ? mergeAuthorNodes.map((author) => normalizeLogin(author?.user?.login))
    : [];
  if (mergeAuthorNode?.oid !== expectedCommit || !mergeAuthorLogins.length ||
      mergeAuthorLogins.some((login) => !login) || mergeAuthorNode?.authors?.pageInfo?.hasNextPage) {
    throw new Error("Exact merged main commit contains unresolved GitHub author or co-author attribution.");
  }
  const commitEntries = (commits ?? []).flat();
  const attributedAuthors = new Map();
  for (const page of Array.isArray(commitAuthors) ? commitAuthors : []) {
    const nodes = page?.data?.repository?.pullRequest?.commits?.nodes;
    if (!Array.isArray(nodes)) throw new Error("Trusted GitHub commit-author attribution is incomplete.");
    for (const node of nodes) {
      const oid = node?.commit?.oid;
      const authors = node?.commit?.authors;
      if (!/^[0-9a-f]{40}$/.test(oid ?? "") || !Array.isArray(authors?.nodes) || authors?.pageInfo?.hasNextPage) {
        throw new Error("Trusted GitHub commit-author attribution is incomplete.");
      }
      const logins = authors.nodes.map((author) => normalizeLogin(author?.user?.login));
      if (!logins.length || logins.some((login) => !login)) {
        throw new Error("Pull request commit contains an unresolved GitHub author or co-author.");
      }
      attributedAuthors.set(oid, logins);
    }
  }
  const commitLogins = [];
  for (const commit of commitEntries) {
    const oid = commit?.sha;
    const authors = attributedAuthors.get(oid);
    if (!authors) throw new Error("Trusted GitHub commit-author attribution does not match every pull request commit.");
    commitLogins.push(commit?.author?.login, commit?.committer?.login, ...authors);
  }
  if (attributedAuthors.size !== new Set(commitEntries.map((commit) => commit?.sha)).size) {
    throw new Error("Trusted GitHub commit-author attribution does not match the pull request commit set.");
  }
  const authorLogins = [pull.user?.login, mergeAuthor, mergeCommitter, ...mergeAuthorLogins, ...commitLogins];
  const normalized = authorLogins.map(normalizeLogin);
  if (!Number.isInteger(pull.number) || !commitEntries.length || normalized.some((login) => !login)) {
    throw new Error("Pull request provenance contains an unresolved human author.");
  }
  return {
    pullRequestNumber: pull.number,
    pullRequestHeadCommit: pull.head?.sha,
    mergeCommit: expectedCommit,
    changeAuthors: [...new Set(normalized)].sort(),
    mergeProvenance: {
      verification: "verified",
      author: mergeAuthor,
      committer: mergeCommitter,
      authors: [...new Set(mergeAuthorLogins)].sort(),
    },
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
  recoveryToken,
  reviewContext,
}) {
  if (reviewContext?.repository !== "serpcompany/serplists.com" || !/^\d+$/.test(reviewContext?.runId ?? "") || !/^\d+$/.test(reviewContext?.runAttempt ?? "") || !/^[0-9a-f]{40}$/.test(reviewContext?.commit ?? "")) {
    throw new Error("Protected production approval requires the canonical GitHub workflow review reference.");
  }
  if (typeof recoveryToken !== "string" || !/^recovery:\d+:\d+:\d+:[0-9a-f]{64}$/.test(recoveryToken)) {
    throw new Error("Protected production approval requires the exact verified recovery receipt token.");
  }
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
  const tokenOccurrences = decision.split(recoveryToken).length - 1;
  if (tokenOccurrences !== 1) {
    throw new Error("Production approval must name the exact verified recovery receipt once.");
  }
  const riskReason = decision.replace(recoveryToken, " ").replace(/\s+/g, " ").trim();
  const riskWordCount = [...new Intl.Segmenter("und", { granularity: "word" }).segment(riskReason)]
    .filter((segment) => segment.isWordLike).length;
  const meaningfulRiskReason = riskReason.length >= 20 && riskWordCount >= 3;
  if (["backfill", "destructive", "irreversible"].includes(classification) && !meaningfulRiskReason) {
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
    if (String(ownerReview.comment ?? "").split(recoveryToken).length - 1 !== 1) throw new Error("Irreversible repository-owner approval must name the exact verified recovery receipt once.");
    if (owner === approver) throw new Error("Irreversible migration requires a distinct additional repository-owner approver.");
  }
  return {
    approver,
    dispatcher: normalizeLogin(actor),
    changeAuthors: [...authors].sort(),
    classification,
    reviewReference: { ...reviewContext, environment: "production" },
    decisionSha256: signatureFor(decision),
    riskDecision: {
      policy: "meaningful-written-risk-reason-v1",
      sha256: signatureFor(riskReason),
      characterCount: riskReason.length,
      wordCount: riskWordCount,
    },
    recoveryTokenSha256: signatureFor(recoveryToken),
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

/**
 * @typedef {{ preparationSha256: string, runId: string, runAttempt: string, artifactId: string, requestSha256?: string }} RecoveryReceipt
 * @typedef {{ verdict: string, summary: object }} ProductionStepResult
 * @typedef {{ version: number, requestSha256: string, context: object, preparedAt: string, results: Record<string, ProductionStepResult> }} ProductionPreparation
 * @typedef {{ recovery: RecoveryReceipt, recoveryTokenSha256: string }} RecoveryBoundApproval
 */

/**
 * Approval may be omitted at the call boundary but is rejected by
 * assertRecoveryApproval. This phase requires the receipt binding, preparation
 * digest/freshness, ledger prefix, and source proof before invoking write steps;
 * the complete request and independent approval are checked at this boundary.
 * Step summaries have different shapes and remain subject to their runtime gates.
 * @param {{
 *   request: object,
 *   commit: string,
 *   database: { databaseName: string, databaseId: string },
 *   pendingMigrations: string[],
 *   classification: 'additive' | 'backfill' | 'destructive' | 'irreversible',
 *   approval?: RecoveryBoundApproval | null,
 *   preparation: ProductionPreparation,
 *   receipt: RecoveryReceipt,
 *   run: (step: string) => ProductionStepResult,
 *   clock?: () => number
 * }} options
 * @returns {{
 *   payload: {
 *     verdict: 'pass', commit: string,
 *     classification: 'additive' | 'backfill' | 'destructive' | 'irreversible',
 *     database: { databaseName: string, databaseId: string }, pendingMigrations: string[],
 *     migrationRange: { from: string | null, to: string | null },
 *     approval: RecoveryBoundApproval, recovery: RecoveryReceipt,
 *     results: Record<string, ProductionStepResult>
 *   }, digest: string, provenance: 'requires-github-artifact-attestation'
 * }}
 */
export function runProductionDataPhase({ request, commit, database, pendingMigrations, classification, approval = null, preparation, receipt, run, clock = Date.now }) {
  validatePromotionEvidence(request);
  assertRequestTarget({ request, commit, database });
  if (classification !== request.classification || JSON.stringify(pendingMigrations) !== JSON.stringify(request.pendingMigrations)) {
    throw new Error('Production classification or pending migrations do not match the exact request.');
  }
  assertRecoveryApproval({ approval, receipt });
  const requestSha256 = digest(request);
  if (preparation?.requestSha256 !== requestSha256 || receipt.requestSha256 !== requestSha256) {
    throw new Error('Production preparation and recovery receipt must bind the exact request.');
  }
  assertApprovalMatchesRequest({ approval, request });
  if (digest(preparation) !== receipt.preparationSha256) throw new Error('Production preparation does not match the approved receipt.');
  assertRecoveryFreshness(preparation, clock);
  assertInvariantSafetySummary({ step: "pre-invariants", summary: preparation.results?.['pre-invariants']?.summary, pendingMigrations });
  assertRepositoryAppliedPrefix({ ...preparation.results['pre-invariants'].summary, pendingMigrations });
  assertSourceSchemaProof(preparation.results['source-schema']?.summary, { ...preparation.results['pre-invariants'].summary, commit, database, pendingMigrations });
  const results = { ...preparation.results };
  for (const step of EXECUTION_STEPS) {
    if (step === 'migration-apply') assertRecoveryFreshness(preparation, clock);
    let result;
    try { result = run(step); } catch (error) { throw wrapCanarySubprocessFailure(`production-${step}`, error); }
    if (result?.verdict !== "pass") throw new Error(`Production ${step} gate failed.`);
    assertProductionStepSummary({ step, summary: result.summary, payload: { ...request, results } });
    if (step === "post-invariants") assertInvariantSummaryTransition({ pre: results['pre-invariants'].summary, post: result.summary });
    if (["identity", "reviewed-pending-range"].includes(step) && JSON.stringify(result.summary) !== JSON.stringify(preparation.results[step].summary)) throw new Error(`Production ${step} changed after recovery preparation.`);
    if (step === "pre-invariants" && result.summary?.ledgerSha256 !== preparation.results[step].summary?.ledgerSha256) throw new Error("Production ledger changed after recovery preparation; fresh preparation and approval required.");
    if (step === 'pre-invariants') assertRepositoryAppliedPrefix({ ...result.summary, pendingMigrations });
    if (step === 'source-schema') {
      assertSourceSchemaProof(result.summary, { ...results['pre-invariants'].summary, commit, database, pendingMigrations });
      if (result.summary.proofSha256 !== preparation.results[step].summary.proofSha256) throw new Error('Source catalog changed after preparation.');
    }
    results[step] = result;
  }
  const payload = {
    verdict: "pass",
    commit,
    classification,
    database,
    pendingMigrations: [...pendingMigrations],
    migrationRange: {
      from: pendingMigrations[0] ?? null,
      to: pendingMigrations.at(-1) ?? null,
    },
    approval,
    recovery: receipt,
    results,
  };
  return createSignedEvidence({ payload });
}

function assertRequestTarget({ request, commit, database }) {
  if (commit !== request.commit || database?.databaseName !== request.database.databaseName || database?.databaseId !== request.database.databaseId) {
    throw new Error('Production commit or database does not match the exact request.');
  }
}

export function assertDeployEvidence({ signedEvidence, commit, database, request }) {
  validatePromotionEvidence(request);
  assertRequestTarget({ request, commit, database });
  const payload = verifySignedEvidence({ signedEvidence });
  if (payload.verdict !== "pass" || payload.commit !== commit ||
      payload.database?.databaseName !== database.databaseName || payload.database?.databaseId !== database.databaseId) {
    throw new Error("Signed production data evidence does not authorize this exact deploy.");
  }
  const resultKeys = Object.keys(payload.results ?? {});
  if (JSON.stringify(resultKeys) !== JSON.stringify(REQUIRED_PRODUCTION_STEPS)) throw new Error("Signed production data evidence does not contain the exact required step set.");
  for (const step of REQUIRED_PRODUCTION_STEPS) {
    const result = payload.results[step];
    if (result?.verdict !== "pass" || typeof result.artifact !== "string" || !result.artifact || !Number.isInteger(result.outputLength) || result.outputLength <= 0 ||
        !Number.isInteger(result.artifactByteLength) || result.artifactByteLength <= 0 || result.artifactByteLength !== result.outputLength || !hasSha256(result.artifactSha256)) throw new Error(`Signed production ${step} evidence is incomplete.`);
    assertProductionStepSummary({ step, summary: result.summary, payload });
    if (IDENTITY_BOUND_STEPS.has(step)) {
      if (!Array.isArray(result.identityChecks) || result.identityChecks.length === 0 || result.identityChecks.some((check) =>
        check?.environment !== "production" || check?.binding !== "DB" || check?.databaseName !== database.databaseName || check?.databaseId !== database.databaseId ||
        check?.before?.databaseName !== database.databaseName || check?.before?.databaseId !== database.databaseId || check?.after?.databaseName !== database.databaseName || check?.after?.databaseId !== database.databaseId
      )) throw new Error(`Signed production ${step} evidence lacks exact before/after D1 identity checks.`);
    }
  }
  if (payload.approval?.environment !== "production" || payload.approval?.source !== "github-environment-review" || typeof payload.approval?.approver !== "string" || !payload.approval.approver || !Array.isArray(payload.approval.changeAuthors) || !payload.approval.changeAuthors.length) throw new Error("Signed production evidence lacks validated independent approval.");
  assertInvariantSummaryTransition({ pre: payload.results['pre-invariants'].summary, post: payload.results['post-invariants'].summary });
  assertRecoveryApproval({ approval: payload.approval, receipt: payload.recovery });
  if (payload.recovery.requestSha256 !== digest(request)) throw new Error("Signed production recovery does not bind this exact request.");
  if (payload.classification !== request.classification || JSON.stringify(payload.pendingMigrations) !== JSON.stringify(request.pendingMigrations) || !migrationRangesEqual(payload.migrationRange, request.migrationRange)) throw new Error("Signed production classification or pending migrations do not match the reviewed request.");
  assertApprovalMatchesRequest({ approval: payload.approval, request });
  return payload;
}

export function validateFinalProductionRelease({
  request,
  signedEvidence,
  smoke,
  deploymentUrl,
  expectedCustomDomain = "https://serplists.com",
}) {
  const data = assertDeployEvidence({ signedEvidence, commit: request.commit, database: request.database, request });
  validateControlledCanaryChecks(smoke);
  if (!migrationRangesEqual(data.migrationRange, request.migrationRange)) {
    throw new Error("Production data evidence migration range does not match the request.");
  }
  if (!/^https:\/\//.test(deploymentUrl) || smoke?.verdict !== "pass" || !Array.isArray(smoke.failures) || smoke.failures.length !== 0 || smoke.commit !== request.commit ||
      smoke.target?.environment !== "production" || smoke.target?.databaseName !== request.database.databaseName ||
      smoke.target?.databaseId !== request.database.databaseId || smoke.deploymentUrl !== deploymentUrl ||
      smoke.customDomain !== expectedCustomDomain) {
    throw new Error("Production smoke evidence does not match the exact commit, environment, database, deployment URL, and custom domain.");
  }
  return data;
}
