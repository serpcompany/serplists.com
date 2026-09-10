import { mkdirSync, writeFileSync, readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import { normalizeMigrationRange, migrationRangesEqual } from "./migration-range-lib.mjs";
/**
 * @typedef {{ name: string, verdict: string, test?: string }} RegressionCheck
 * @typedef {{ environment: string, databaseName: string, databaseId: string, binding: string }} RegressionTarget
 * @typedef {{ leakedUsers: number, leakedTemplates: number, leakedRuns: number, leakedSmokeStatePaths: number, verdict: string }} RegressionTeardown
 * @typedef {{ applicable: boolean, verdict?: string, failure?: string | null, failureArtifacts: string[] }} BrowserEvidence
 * @typedef {{
 *   commit: string,
 *   workingTreeDirty?: boolean,
 *   workingTreeDirtyPaths?: string[],
 *   workspaceCleanlinessVerdict?: string,
 *   unexpectedFilesystemChanges?: import('./workspace-cleanliness-lib.mjs').WorkspaceChange[],
 *   target: RegressionTarget,
 *   migrationRange: { from: string | null, to: string | null },
 *   checks: RegressionCheck[],
 *   invariants: Record<string, unknown>,
 *   teardown: RegressionTeardown,
 *   browserEvidence: BrowserEvidence
 * }} RegressionReportOptions
 * @typedef {Required<RegressionReportOptions> & { check: string, evidenceChecks: RegressionCheck[], verdict: 'pass' | 'fail' }} RegressionReport
 */

/**
 * Required evidence and identity fields are checked at runtime too. Invariants
 * carry domain-specific evidence; known nonzero counters and fail verdicts block.
 * @param {RegressionReportOptions} options
 * @returns {RegressionReport}
 */
export function buildDataRegressionReport({
  commit,
  workingTreeDirty = false,
  workingTreeDirtyPaths = [],
  workspaceCleanlinessVerdict = "not-enforced",
  unexpectedFilesystemChanges = [],
  target,
  migrationRange,
  checks,
  invariants,
  teardown,
  browserEvidence,
}) {
  for (const [name, value] of Object.entries({ commit, target, migrationRange, checks, invariants, teardown, browserEvidence })) {
    if (value === undefined || value === null) throw new Error(`Data regression report is missing ${name}.`);
  }
  for (const field of ["environment", "databaseName", "databaseId", "binding"]) {
    if (!target[field]) throw new Error(`Data regression report target is missing ${field}.`);
  }
  for (const field of ["leakedUsers", "leakedTemplates", "leakedRuns", "leakedSmokeStatePaths", "verdict"]) {
    if (teardown[field] === undefined) throw new Error(`Data regression teardown is missing ${field}.`);
  }
  const invariantFailure = [
    "changedCounts",
    "changedOwners",
    "changedActiveDeleted",
    "foreignKeyViolations",
    "invalidJson",
  ].some((name) => typeof invariants[name] === "number" && invariants[name] !== 0) ||
    (Array.isArray(invariants.preservationDifferences) && invariants.preservationDifferences.length > 0) ||
    invariants.verdict === "fail";
  const browserFailure = browserEvidence.applicable === true && browserEvidence.verdict !== "pass";
  const namedChecksPass = checks.every((check) => check.verdict === "pass");
  const workspaceFailure = workspaceCleanlinessVerdict === "fail";
  const verdict = namedChecksPass && teardown.verdict === "pass" && !invariantFailure && !browserFailure && !workspaceFailure
    ? "pass"
    : "fail";
  const evidenceChecks = [
    { name: "invariant verdict", verdict: invariantFailure ? "fail" : "pass" },
    { name: "teardown verdict", verdict: teardown.verdict === "pass" ? "pass" : "fail" },
    { name: "browser evidence verdict", verdict: browserFailure ? "fail" : "pass" },
    { name: "workspace cleanliness verdict", verdict: workspaceFailure ? "fail" : "pass" },
    { name: "overall verdict", verdict },
  ];
  return {
    check: "data-regression-suite",
    fixtureEvidence: "synthetic",
    commit,
    workingTreeDirty,
    workingTreeDirtyPaths,
    workspaceCleanlinessVerdict,
    unexpectedFilesystemChanges,
    target,
    migrationRange: normalizeMigrationRange(migrationRange),
    checks,
    invariants,
    teardown,
    browserEvidence,
    evidenceChecks,
    verdict,
  };
}

/**
 * @param {RegressionReport & {
 *   runContext?: { mode: string, startCommit: string | null, endCommit: string | null },
 *   coverage?: { planId?: string | null, declarationSha256?: string | null, affectedTables?: string[] }
 * }} report
 * @returns {string}
 */
export function renderDataRegressionMarkdown(report) {
  const status = report.verdict.toUpperCase();
  const lines = [
    `# Data regression suite: ${status}`,
    "",
    `- Environment: ${report.target.environment}`,
    "- Fixture evidence: synthetic local data; supplied sanitized-source checks are reported separately.",
    `- Binding: ${report.target.binding}`,
    `- Database: ${report.target.databaseName} (${report.target.databaseId})`,
    `- Commit: ${report.commit}`,
    `- Mode: ${report.runContext?.mode ?? "gating"}`,
    `- Start HEAD: ${report.runContext?.startCommit ?? report.commit}`,
    `- End HEAD: ${report.runContext?.endCommit ?? report.commit}`,
    `- Working tree dirty: ${report.workingTreeDirty ? "yes" : "no"}`,
    `- Dirty paths: ${report.workingTreeDirtyPaths.join(", ") || "none"}`,
    `- CI workspace cleanliness: ${report.workspaceCleanlinessVerdict}`,
    `- Unexpected filesystem changes: ${report.unexpectedFilesystemChanges.map((entry) => `${entry.change}:${entry.path}`).join(", ") || "none"}`,
    `- Migration range: ${report.migrationRange.from} -> ${report.migrationRange.to}`,
    `- Coverage plan: ${report.coverage?.planId ?? "missing"}`,
    `- Coverage declaration: ${report.coverage?.declarationSha256 ?? "missing"}`,
    `- Affected tables: ${report.coverage?.affectedTables?.join(", ") ?? "missing"}`,
    "",
    "## Checks",
    "",
    ...report.checks.map((check) => `- ${check.verdict === "pass" ? "PASS" : "FAIL"}: ${check.name}`),
    "",
    "## Invariants",
    "",
    ...Object.entries(report.invariants).map(([name, value]) =>
      `- ${name}: ${typeof value === "object" ? JSON.stringify(value) : value}`,
    ),
    "",
    "## Teardown",
    "",
    `- Verdict: ${report.teardown.verdict}`,
    `- Leaked users: ${report.teardown.leakedUsers}`,
    `- Leaked templates: ${report.teardown.leakedTemplates}`,
    `- Leaked runs: ${report.teardown.leakedRuns}`,
    `- Leaked smoke state paths: ${report.teardown.leakedSmokeStatePaths}`,
    "",
    "## Browser failure evidence",
    "",
    report.browserEvidence.applicable
      ? `- Verdict: ${report.browserEvidence.verdict}\n- Artifacts: ${report.browserEvidence.failureArtifacts.join(", ") || "none"}`
      : "- Not applicable to this database/API automation run.",
    "",
  ];
  return lines.join("\n");
}

export const requiredIntegrationScenarios = {
  "sanitizer-export-ownership": "sanitizer export output ownership actual CLI",
  "sanitizer-export-pinned": "pinned sanitizer exporter",
  "malformed-checklist-content-write-safety": "malformed checklist content write safety",
  "mandatory-rules-atomic-failure-proof": "mandatory rules atomic failure proof",
  "billing-write-failure-and-retry-proof": "billing write failure and retry proof",
  "route-inventory-and-owned-teardown": "route inventory and owned teardown",
  "fresh-migration-chain": "fresh migration chain",
  "exact-pre-incident-schema-mismatch": "exact pre-incident schema mismatch",
  "0023-to-0024-invariant-preservation": "0023 to 0024 invariant preservation",
  "existing-nested-identity-preservation": "existing nested identity preservation",
  "deterministic-legacy-identity-backfill": "deterministic legacy identity backfill",
  "multiple-active-completion-states": "multiple active completion states",
  "completed-shared-archived-stale-lifecycle": "completed shared archived stale lifecycle",
  "section-item-sub-item-evolution": "section item sub-item evolution",
  "explicit-completed-run-revalidation": "explicit completed-run revalidation",
  "template-optimistic-concurrency": "template optimistic concurrency",
  "run-optimistic-concurrency": "run optimistic concurrency",
  "authenticated-visibility-evaluator": "authenticated visibility evaluator",
  "authenticated-false-empty-detection": "authenticated false-empty detection",
  "authenticated-api-error-detection": "authenticated API error detection",
  "sanitized-transformation-corruption-detection": "sanitized transformation corruption detection",
  "rollback-recovery-rehearsal": "rollback recovery rehearsal",
  "fixture-teardown-leak-detection": "fixture teardown leak detection",
  "observed-fixture-teardown-counts": "observed fixture teardown counts",
  "smoke-child-secret-allowlist": "smoke child secret allowlist",
  "smoke-state-observed-teardown": "smoke state observed teardown",
  "concurrent-head-and-worktree-mutation-detection": "concurrent HEAD and worktree mutation detection",
  "poisoned-git-context-isolation": "poisoned Git context isolation"
};

// Tests emit these outcomes after their real assertions; native runner failure
// remains independently blocking. Files are unique so duplicate IDs cannot hide.
export function recordIntegrationScenario(id, env = process.env) {
  if (!env.DATA_SCENARIO_DIR) return;
  if (!/^[a-z0-9-]+$/.test(id)) throw new Error('Invalid integration scenario ID');
  mkdirSync(env.DATA_SCENARIO_DIR, { recursive: true });
  writeFileSync(join(env.DATA_SCENARIO_DIR, `${id}-${randomUUID()}.json`), JSON.stringify({
    id, verdict: 'pass', commit: env.DATA_REGRESSION_START_COMMIT,
    target: { environment: 'local', binding: 'DB', databaseId: 'local:miniflare:DB@isolated-data-regression', synthetic: true },
    migrationRange: normalizeMigrationRange({ from: env.DATA_REGRESSION_MIGRATION_FROM, to: env.DATA_REGRESSION_MIGRATION_TO }),
  }));
}

export function readIntegrationScenarios(directory) {
  return readdirSync(directory).filter(file => file.endsWith('.json')).map(file => JSON.parse(readFileSync(join(directory, file), 'utf8')));
}

export function validateIntegrationScenarios(results, required, { commit, migrationRange }) {
  return Object.entries(required).map(([id, name]) => {
    const matches = results.filter(result => result.id === id);
    const valid = matches.length === 1 && matches.every(result => result.verdict === 'pass'
      && result.commit === commit && result.target?.environment === 'local'
      && result.target?.binding === 'DB' && result.target?.databaseId === 'local:miniflare:DB@isolated-data-regression'
      && result.migrationRange && migrationRangesEqual(result.migrationRange, migrationRange));
    return { id, name, test: id, verdict: valid ? 'pass' : 'fail' };
  });
}
