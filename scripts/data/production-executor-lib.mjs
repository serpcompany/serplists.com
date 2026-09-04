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
        if (next === quote) {
          current += next;
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (["'", '"', "`"].includes(character)) {
      quote = character;
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
  if (/^(insert|update|replace)\b/i.test(normalized)) return "backfill";
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
  if ((env.PRODUCTION_BACKUP_ENCRYPTION_KEY ?? "").length < 32) {
    throw new Error("Protected production backup encryption key is missing.");
  }
  if ((env.PRODUCTION_INVARIANT_HMAC_KEY ?? "").length < 32) {
    throw new Error("Protected production invariant HMAC key is missing.");
  }
  if (env.PRODUCTION_BACKUP_ENCRYPTION_KEY === env.PRODUCTION_INVARIANT_HMAC_KEY) {
    throw new Error("Production backup encryption and invariant HMAC keys must be separate.");
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
  const staging = evidence.staging;
  const provenance = evidence.changeProvenance;
  if (evidence.mergeContext?.commit !== evidence.commit || !/^[0-9a-f]{40}$/.test(evidence.mergeContext?.tree ?? "") ||
      provenance?.mergeCommit !== evidence.commit || staging?.commit !== provenance?.pullRequestHeadCommit ||
      staging?.tree !== evidence.mergeContext.tree || staging?.verdict !== "pass" || staging?.target?.environment !== "staging" ||
      staging?.target?.databaseId === evidence.database.databaseId || staging?.migrationRange?.from !== evidence.migrationRange.from ||
      staging?.migrationRange?.to !== evidence.migrationRange.to || staging?.data?.verdict !== "pass" ||
      staging?.schema?.verdict !== "pass" || staging?.schema?.ledger?.verdict !== "pass" || staging?.invariants?.verdict !== "pass" ||
      staging?.deploy?.verdict !== "pass" || staging?.smoke?.verdict !== "pass" || !Array.isArray(staging?.smoke?.failures) ||
      staging.smoke.failures.length || staging?.teardown?.verdict !== "pass") {
    throw new Error("Exact-tree staging data, deploy, smoke, and teardown evidence is missing or failed.");
  }
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
