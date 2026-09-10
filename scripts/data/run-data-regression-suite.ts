import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, unlinkSync, writeFileSync } from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { fileURLToPath } from "node:url";
import { captureRepositoryGitState, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { migrationRangesEqual } from "./migration-range-lib.mjs";
import { assertRuntimeRangeBinding, validateFullExportRecoveryProof, assertSourceHandlerProofTap } from './runtime-gate-contract.mjs';
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { authenticatedCoverageAssertions, validateAuthenticatedCandidateEvidence } from "./authenticated-coverage-lib.mjs";
import { validateSanitizedStateBinding, validateSanitizedCohortProof } from "./sanitized-state-lib.mjs";

import { buildDataRegressionReport, renderDataRegressionMarkdown, requiredIntegrationScenarios, readIntegrationScenarios, validateIntegrationScenarios } from "./data-regression-report-lib.mjs";
import { loadEnvironmentInventory } from "./environment-identity-lib.mjs";
import { runProductionShapedMigrationMatrix } from "./production-shaped-migration-matrix";
import { writeDataCheckReports } from "./reporting.mjs";
import { runFixtureTeardownProbe } from "./teardown-probe";
import { acquireSmokeRunLock } from "./smoke-run-lock-lib.mjs";
import {
  captureWorkspaceMetadata,
  compareWorkspaceMetadata,
  evaluateImmutableRunContext,
  evaluateWorkspaceCleanliness,
  restorePreexistingEmptyWranglerTemp,
} from "./workspace-cleanliness-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const nonGating = process.argv.includes("--non-gating");
const startGitState = captureRepositoryGitState({ repoRoot });
const startCommit = startGitState.commit;
const startDirtyPaths = startGitState.paths;
const valueAfter = (name: string) => process.argv.includes(name) ? process.argv[process.argv.indexOf(name) + 1] : undefined;
let rehearsalPlan: ReturnType<typeof resolveRehearsalPlan> | null = null;
let rehearsalPlanFailure: string | null = null;
try {
  rehearsalPlan = resolveRehearsalPlan({ repoRoot, commit: startCommit, migrationFrom: valueAfter("--migration-from"), migrationTo: valueAfter("--migration-to"), baseRef: valueAfter("--base-ref") ?? process.env.DATA_REGRESSION_BASE_SHA });
} catch (error) { rehearsalPlanFailure = error instanceof Error ? error.message : String(error); }
const reportDirectory = path.resolve(
  repoRoot,
  process.argv.includes("--report-dir")
    ? process.argv[process.argv.indexOf("--report-dir") + 1]
    : "tmp/data-reports",
);
const rawVitestReport = path.join(reportDirectory, "data-regression-vitest.json");
const browserTeardownReportPath = path.join(reportDirectory, "browser-smoke-teardown.json");
const browserJsonReportPath = path.join(reportDirectory, "browser-smoke-playwright.json");
const routeCoverageReportPath = path.join(reportDirectory, "route-coverage.json");
const routeNegativeReportPath = browserJsonReportPath.replace(/\.json$/, "-route-negative.json");
const routeNegativeEvidencePath = path.join(reportDirectory, "route-coverage-negative.json");
const authenticatedRehearsalProofPath = path.join(reportDirectory, "authenticated-rehearsal-handler.json");
const candidateAuthenticatedProofPath = path.join(reportDirectory, "candidate-authenticated-handler.json");
const reportRoot = path.join(repoRoot, "tmp", "data-reports");
if (
  reportDirectory !== reportRoot &&
  !reportDirectory.startsWith(`${reportRoot}${path.sep}`)
) {
  throw new Error(`Report directory must stay under ${reportRoot}.`);
}
const reportDirectoryRelative = path.relative(repoRoot, reportDirectory);
const filesystemBefore = captureWorkspaceMetadata({ repoRoot });
const scenarioDirectory = path.join(reportDirectory, 'integration-scenarios');
rmSync(scenarioDirectory, { recursive: true, force: true });
mkdirSync(scenarioDirectory, { recursive: true });
const scenarioIdentity = { commit: startCommit, migrationRange: rehearsalPlan?.migrationRange ?? { from: null, to: null } };
const scenarioEnvironment = { DATA_SCENARIO_DIR: scenarioDirectory, DATA_REGRESSION_START_COMMIT: startCommit,
  DATA_REGRESSION_MIGRATION_FROM: scenarioIdentity.migrationRange.from ?? 'none', DATA_REGRESSION_MIGRATION_TO: scenarioIdentity.migrationRange.to ?? 'none' };
const sourceScenarios = { 'source-malformed-preservation': 'source malformed preservation', 'source-no-eligible-refusal': 'source no-eligible refusal', 'source-missing-column': 'source missing-column detector' };
// These source controls invoke the normal browser harness, so they must complete
// before this aggregate owns the same lock. It is not a nested Vitest test.
mkdirSync(reportDirectory, { recursive: true });
try {
  const tap = execFileSync(process.execPath, ['--test', '--test-reporter=tap', 'scripts/data/sanitized-handler-proof.node-test.mjs'], {
    cwd: repoRoot, env: { ...sanitizedGitEnvironment(), DATA_REPORT_DIR: reportDirectory, ...scenarioEnvironment },
    encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'], timeout: 540_000, maxBuffer: 4 * 1024 * 1024,
  });
  writeFileSync(path.join(reportDirectory, 'source-handler-regressions.tap'), tap);
  assertSourceHandlerProofTap(tap);
  if (validateIntegrationScenarios(readIntegrationScenarios(scenarioDirectory), sourceScenarios, scenarioIdentity).some(check => check.verdict !== 'pass')) throw new Error('Missing source scenario outcomes');
} catch {
  writeDataCheckReports({ name: 'data-regression-suite', reportDirectory,
    report: { verdict: 'fail', commit: startCommit,
      target: { environment: 'local', binding: 'DB', databaseName: 'serp-checklists-db', databaseId: 'local:miniflare:DB@isolated-data-regression' },
      migrationRange: rehearsalPlan?.migrationRange ?? { from: 'invalid', to: 'invalid' },
      checks: [{ name: 'source-derived handler positive and negative controls', verdict: 'fail' }], incomplete: true },
    summary: 'FAIL source-derived handler controls; subsequent aggregate phases were not started. Synthetic local proof only.',
  });
  process.exit(1);
}
const releaseRegressionLock = await acquireSmokeRunLock({
  lockPath: path.join(repoRoot, ".wrangler", "smoke-state.lock"),
});
process.once("exit", releaseRegressionLock);

interface VitestJsonReport { success?: boolean; numPendingTests?: number; numFailedTests?: number }
interface RegressionCheck { name: string; test: string; verdict: string }

mkdirSync(reportDirectory, { recursive: true });
const fullExportRecoveryPath = path.join(reportDirectory, 'full-export-recovery.json');
if (existsSync(fullExportRecoveryPath)) unlinkSync(fullExportRecoveryPath);
let vitestResult: VitestJsonReport;
let commandFailure: string | null = null;
try {
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "run", "test:data:assertions",
      "--reporter=json", `--outputFile=${rawVitestReport}`,
    ],
    { cwd: repoRoot, env: { ...sanitizedGitEnvironment(), DATA_REPORT_DIR: reportDirectory, ...scenarioEnvironment }, stdio: ["ignore", "inherit", "inherit"] },
  );
  vitestResult = JSON.parse(readFileSync(rawVitestReport, "utf8"));
} catch (error) {
  commandFailure = error instanceof Error ? error.message : String(error);
  try {
    vitestResult = JSON.parse(readFileSync(rawVitestReport, "utf8"));
  } catch {
    vitestResult = { success: false };
  }
}

const checks: RegressionCheck[] = validateIntegrationScenarios(readIntegrationScenarios(scenarioDirectory), requiredIntegrationScenarios, scenarioIdentity);
checks.push({ name: 'native data assertion results', test: 'Vitest success with no skipped or failed data assertions', verdict: vitestResult.success && vitestResult.numPendingTests === 0 && vitestResult.numFailedTests === 0 ? 'pass' : 'fail' });
checks.push({ name: 'source-derived handler positive and negative controls', test: 'all current-schema synthetic browser controls execute without skips or failures before the aggregate lock', verdict: 'pass' });
try {
  const recovery = JSON.parse(readFileSync(fullExportRecoveryPath,'utf8'));
  const valid = validateFullExportRecoveryProof(recovery,startCommit);
  checks.push({name:'actual full-export recovery artifact',test:'four fresh local D1 full-export restores and observed teardown bound to candidate',verdict:valid?'pass':'fail'});
} catch {
  checks.push({name:'actual full-export recovery artifact',test:'four fresh local D1 full-export restores and observed teardown bound to candidate',verdict:'fail'});
}
checks.push({ name: "reviewed rehearsal coverage", test: "exact changed migration and maintenance artifacts have affected-table fixtures and invariants", verdict: rehearsalPlan ? "pass" : "fail" });
if (commandFailure) checks.push({
  name: "test command",
  test: "focused Vitest command completed",
  verdict: "fail",
});

let browserFailure: string | null = null;
let actualApplicationVisibilityPassed = false;
let candidateAuthenticated = { verdict: "fail", checks: {} } as Record<string, unknown>;
let routeCoverage = { verdict: "fail" } as Record<string, unknown>;
let routeNegativePassed = false;
let authenticatedRehearsal = { applicable: false, verdict: "not-applicable" } as Record<string, unknown>;
const sanitizedPathArg = valueAfter("--sanitized");
const sanitizerManifestArg = valueAfter("--sanitizer-manifest");
let sanitizedArtifact: { sqlPath: string; manifestPath: string; sha256: string } | null = null;
if ((sanitizedPathArg == null) !== (sanitizerManifestArg == null)) {
  browserFailure = "Sanitized rehearsal requires both --sanitized and --sanitizer-manifest.";
} else if (sanitizedPathArg && sanitizerManifestArg) {
  try {
    const sanitizedSql = readFileSync(path.resolve(repoRoot, sanitizedPathArg), "utf8");
    const manifestInput: unknown = JSON.parse(readFileSync(path.resolve(repoRoot, sanitizerManifestArg), "utf8"));
    const manifest = validateSanitizedRehearsalArtifact({ sql: sanitizedSql, manifest: manifestInput, policy: loadSanitizerPolicy({ repoRoot }), now: new Date(), migrationRange: rehearsalPlan?.migrationRange, sourceSchema: rehearsalPlan?.preMigration });
    if (manifest.provenance.gitCommit !== startCommit) throw new Error("Sanitizer manifest commit does not match this candidate.");
    sanitizedArtifact = { sqlPath: path.resolve(repoRoot, sanitizedPathArg), manifestPath: path.resolve(repoRoot, sanitizerManifestArg), sha256: manifest.artifact.sha256 };
    authenticatedRehearsal = { applicable: true, verdict: "fail", sanitizerArtifactSha256: sanitizedArtifact.sha256 };
  } catch (error) { browserFailure = error instanceof Error ? error.message : String(error); }
}
let browserTeardown = {
  leakedStatePaths: 1,
  verdict: "fail",
};
if (existsSync(browserTeardownReportPath)) unlinkSync(browserTeardownReportPath);
if (existsSync(browserJsonReportPath)) unlinkSync(browserJsonReportPath);
for (const file of [routeCoverageReportPath, routeNegativeReportPath, routeNegativeEvidencePath]) if (existsSync(file)) unlinkSync(file);
try {
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["run", "test:smoke"],
    {
      cwd: repoRoot,
      env: {
        ...sanitizedGitEnvironment(),
        ...scenarioEnvironment,
        PLAYWRIGHT_TEARDOWN_REPORT: browserTeardownReportPath,
        PLAYWRIGHT_JSON_REPORT: browserJsonReportPath,
        PLAYWRIGHT_ROUTE_COVERAGE_PROOF: routeCoverageReportPath,
        PLAYWRIGHT_SMOKE_LOCK_HELD: "1",
        DATA_REGRESSION_START_COMMIT: startCommit,
        DATA_REGRESSION_MIGRATION_FROM: rehearsalPlan?.migrationRange.from ?? "none",
        DATA_REGRESSION_MIGRATION_TO: rehearsalPlan?.migrationRange.to ?? "none",
        PLAYWRIGHT_CANDIDATE_AUTH_PROOF: candidateAuthenticatedProofPath,
        ...(sanitizedArtifact && rehearsalPlan ? {
          PLAYWRIGHT_SANITIZED_REHEARSAL_SQL: sanitizedArtifact.sqlPath,
          PLAYWRIGHT_SANITIZER_SHA256: sanitizedArtifact.sha256,
          PLAYWRIGHT_SANITIZER_MANIFEST: sanitizedArtifact.manifestPath,
          PLAYWRIGHT_REHEARSAL_PROOF: authenticatedRehearsalProofPath,
        } : {}),
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  browserTeardown = JSON.parse(readFileSync(browserTeardownReportPath, "utf8"));
  if (browserTeardown.verdict !== "pass") {
    browserFailure = "Browser smoke state teardown reported leaked local state.";
  }
  const browserReport = JSON.parse(readFileSync(browserJsonReportPath, 'utf8'));
  if (browserReport.stats?.unexpected !== 0 || browserReport.stats?.flaky !== 0) throw new Error('Native browser results failed');
  const routeReport = JSON.parse(readFileSync(routeCoverageReportPath, "utf8"));
  if (!rehearsalPlan) throw new Error('Runtime evidence requires a resolved selected rehearsal range.');
  assertRuntimeRangeBinding(routeReport, rehearsalPlan.migrationRange);
  const expectedRouteLedger = readdirSync(path.join(repoRoot, "db/migrations"))
    .filter((name) => /^\d+.*\.sql$/.test(name)).sort()
    .map((name) => ({ name, sha256: createHash("sha256").update(readFileSync(path.join(repoRoot, "db/migrations", name))).digest("hex") }));
  const routeBound = routeReport.verdict === "pass" && routeReport.commit === startCommit
    && routeReport.target?.environment === "local" && routeReport.target?.binding === "DB"
    && routeReport.target?.databaseId === "local:miniflare:DB@isolated-data-regression"
    && JSON.stringify(routeReport.migrationLedger) === JSON.stringify(expectedRouteLedger)
    && Array.isArray(routeReport.checks) && routeReport.checks.length > 0
    && routeReport.checks.every((check: { verdict?: string }) => check.verdict === "pass");
  routeCoverage = { ...routeReport, verdict: routeBound ? "pass" : "fail" };
  if (!routeBound) throw new Error("Real D1 route coverage is missing, failed, or bound to a different commit or migration ledger.");
  const negativeEvidence = JSON.parse(readFileSync(routeNegativeEvidencePath, "utf8"));
  assertRuntimeRangeBinding(negativeEvidence, rehearsalPlan.migrationRange);
  routeNegativePassed = validateIntegrationScenarios(readIntegrationScenarios(scenarioDirectory), { 'browser-missing-column': 'browser missing-column detector' }, scenarioIdentity)[0].verdict === 'pass'
    && negativeEvidence.verdict === "pass" && negativeEvidence.commit === startCommit
    && JSON.stringify(negativeEvidence.target) === JSON.stringify(routeReport.target)
    && JSON.stringify(negativeEvidence.migrationRange) === JSON.stringify(routeReport.migrationRange)
    && JSON.stringify(negativeEvidence.migrationLedger) === JSON.stringify(expectedRouteLedger);
  if (!routeNegativePassed) throw new Error("Real D1 missing-column page regression detector was missing or failed.");
  const visibilityPassed = validateIntegrationScenarios(readIntegrationScenarios(scenarioDirectory), { 'browser-owned-visibility': 'authenticated API and dashboard visibility' }, scenarioIdentity)[0].verdict === 'pass';
  actualApplicationVisibilityPassed = visibilityPassed === true;
  if (!visibilityPassed) {
    browserFailure = "Actual Better Auth cookie/API/dashboard visibility journey was missing or failed.";
  }
  if (validateIntegrationScenarios(readIntegrationScenarios(scenarioDirectory), { 'browser-false-empty': 'false-empty consuming page detector' }, scenarioIdentity)[0].verdict !== 'pass') throw new Error('Missing false-empty page detector');
  const candidateProof = JSON.parse(readFileSync(candidateAuthenticatedProofPath, "utf8"));
  const candidateChecks = candidateProof.checks ?? {};
  const candidateBound = candidateProof.verdict === "pass" && candidateProof.commit === startCommit && candidateChecks.templateRead === true && candidateChecks.templateWriteReadback === true && candidateChecks.runRead === true && candidateChecks.runWriteReadback === true;
  candidateAuthenticated = { ...candidateProof, verdict: candidateBound ? "pass" : "fail" };
  if (!candidateBound) browserFailure = "Authenticated candidate template/run read-write proof is incomplete.";
  if (sanitizedArtifact && rehearsalPlan) {
    const proof = JSON.parse(readFileSync(authenticatedRehearsalProofPath, "utf8"));
    const falseEmptyDetection = checks.find((check) => check.name === "authenticated false-empty detection")?.verdict;
    const apiErrorDetection = checks.find((check) => check.name === "authenticated API error detection")?.verdict;
    const combinedChecks = { ...proof.checks, falseEmptyDetection, apiErrorDetection };
    let strictChecks = false;
    try { validateAuthenticatedCandidateEvidence({ ...proof, checks: combinedChecks }, { requireDetectors: true }); strictChecks = true; } catch { strictChecks = false; }
    validateSanitizedStateBinding(proof.postMigrationState, proof.postMigrationState);
    validateSanitizedCohortProof(proof.cohortProof, { state: proof.postMigrationState, selection: JSON.parse(readFileSync(sanitizedArtifact.manifestPath, 'utf8')).selection });
    const bound = strictChecks && proof.handlerStateReadback === true && proof.transformation?.verdict === "pass" && proof.postMigrationState.sourceSha256 === sanitizedArtifact.sha256 && proof.commit === startCommit && proof.sanitizerArtifactSha256 === sanitizedArtifact.sha256 && migrationRangesEqual(proof.migrationRange, rehearsalPlan.migrationRange);
    authenticatedRehearsal = { ...proof, checks: combinedChecks, applicable: true, verdict: bound ? "pass" : "fail" };
    if (!bound) browserFailure = "Authenticated sanitized candidate-handler evidence is incomplete or mismatched.";
  }
} catch (error) {
  browserFailure = error instanceof Error ? error.message : String(error);
  try {
    browserTeardown = JSON.parse(readFileSync(browserTeardownReportPath, "utf8"));
  } catch {
    // Keep the fail-closed default when teardown evidence is unavailable.
  }
}
checks.push({
  name: "learner-visible browser smoke",
  test: "Playwright smoke journeys completed with isolated local data and no developer secrets",
  verdict: browserFailure ? "fail" : "pass",
});
checks.push({ name: "authenticated candidate template and run read-write", test: "authenticated candidate API proves template read template write readback run read and run write readback", verdict: candidateAuthenticated.verdict === "pass" ? "pass" : "fail" });
checks.push({ name: "real D1 page and query coverage", test: "all required real Worker and local D1 route scenarios pass for the exact commit and applied migration ledger", verdict: routeCoverage.verdict === "pass" ? "pass" : "fail" });
checks.push({ name: "broken query page detector", test: "a missing D1 column fails the normal consuming-page error detector", verdict: routeNegativePassed ? "pass" : "fail" });
if (authenticatedRehearsal.applicable === true) {
  checks.push({
    name: "authenticated sanitized candidate handlers",
    test: "exact sanitized representative rows pass authenticated candidate template and run reads and writes",
    verdict: authenticatedRehearsal.verdict === "pass" ? "pass" : "fail",
  });
}
checks.push({
  name: "actual Better Auth cookie and application visibility",
  test: "account-owned D1 template is visible through the actual /api/templates handler and dashboard",
  verdict: actualApplicationVisibilityPassed ? "pass" : "fail",
});

function collectBrowserFailureArtifacts(directory: string): string[] {
  if (!existsSync(directory)) return [];
  const artifacts: string[] = [];
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    const fullPath = path.join(directory, entry.name);
    if (entry.isDirectory()) artifacts.push(...collectBrowserFailureArtifacts(fullPath));
    else if (["error-context.md", "trace.zip"].includes(entry.name) || entry.name.endsWith(".png")) {
      artifacts.push(path.relative(repoRoot, fullPath));
    }
  }
  return artifacts.sort();
}

let migration: ReturnType<typeof runProductionShapedMigrationMatrix> | null = null;
let migrationFailure: string | null = null;
try {
  if (!rehearsalPlan) throw new Error(rehearsalPlanFailure ?? "Reviewed rehearsal plan is unavailable.");
  migration = runProductionShapedMigrationMatrix({ plan: rehearsalPlan });
} catch (error) {
  migrationFailure = error instanceof Error ? error.message : String(error);
  checks.push({
    name: "migration matrix execution",
    test: "production-shaped migration matrix completed",
    verdict: "fail",
  });
}
const inventory = loadEnvironmentInventory({ repoRoot });
const endGitState = captureRepositoryGitState({ repoRoot });
const endCommit = endGitState.commit;
let fixtureTeardown: {
  leakedUsers: number;
  leakedTemplates: number;
  leakedRuns: number;
  verdict: "pass" | "fail";
} = {
  leakedUsers: 1,
  leakedTemplates: 1,
  leakedRuns: 1,
  verdict: "fail",
};
try {
  fixtureTeardown = runFixtureTeardownProbe();
} catch {
  // Keep the fail-closed observed-state default.
}
const endDirtyPaths = endGitState.paths;
const workingTreeDirtyPaths = [...new Set([...startDirtyPaths, ...endDirtyPaths])].sort();
const immutableRun = evaluateImmutableRunContext({ startCommit, endCommit, startPaths: startDirtyPaths, endPaths: endDirtyPaths, nonGating });
restorePreexistingEmptyWranglerTemp({ repoRoot, before: filesystemBefore });
// All shared-state work and teardown is complete. Audit the released resource,
// rather than exempting an active lock from filesystem damage detection.
releaseRegressionLock();
process.removeListener("exit", releaseRegressionLock);
const filesystemChanges = compareWorkspaceMetadata({
  before: filesystemBefore,
  after: captureWorkspaceMetadata({ repoRoot }),
});
const workspaceCleanliness = evaluateWorkspaceCleanliness({
  nonGating,
  paths: workingTreeDirtyPaths,
  filesystemChanges,
  allowedOutputRoots: [
    reportDirectoryRelative,
    "tests/test-results",
    "playwright-report",
    "dist",
    ".wrangler/smoke-state",
  ],
});
const executedAssertions = new Map((migration?.assertions ?? []).map((assertion) => [assertion.name, assertion.verdict]));
for (const assertion of authenticatedCoverageAssertions({ candidateAuthenticated, falseEmptyVerdict: checks.find((check) => check.name === "authenticated false-empty detection")?.verdict, apiErrorVerdict: checks.find((check) => check.name === "authenticated API error detection")?.verdict })) executedAssertions.set(assertion.name, assertion.verdict);
const coverage = rehearsalPlan && migration ? {
  artifactSha256: rehearsalPlan.artifactSha256,
  ...migration.coverage,
  executedAssertions: [...executedAssertions].map(([name, verdict]) => ({ name, verdict })),
  verdict: rehearsalPlan.invariants.every((name) => executedAssertions.get(name) === "pass") ? "pass" : "fail",
} : { verdict: "fail", error: rehearsalPlanFailure, planId: null, affectedTables: [], invariants: [], declarationSha256: null };
checks.push({ name: "executed fixture-profile assertions", test: "every claimed fixture-profile invariant is an actually executed passing named assertion", verdict: coverage.verdict === "pass" ? "pass" : "fail" });
checks.push({
  name: "gating workspace cleanliness",
  test: "data regression execution leaves no unexpected tracked unignored or ignored paths",
  verdict: workspaceCleanliness.verdict === "fail" ? "fail" : "pass",
});
checks.push({ name: "immutable regression commit", test: "HEAD and the tracked/untracked worktree remain unchanged for the complete run", verdict: immutableRun.verdict === "fail" ? "fail" : "pass" });
const report = {
  ...buildDataRegressionReport({
  commit: startCommit,
  workingTreeDirty: workspaceCleanliness.dirty,
  workingTreeDirtyPaths: workspaceCleanliness.paths,
  workspaceCleanlinessVerdict: workspaceCleanliness.verdict,
  unexpectedFilesystemChanges: workspaceCleanliness.unexpectedFilesystemChanges,
  target: {
    environment: "local",
    databaseName: inventory.environments.local.databaseName,
    databaseId: `${inventory.environments.local.databaseId}@isolated-data-regression`,
    binding: inventory.binding,
  },
  migrationRange: migration?.migrationRange ?? {
    from: rehearsalPlan?.migrationRange.from ?? null,
    to: rehearsalPlan?.migrationRange.to ?? null,
  },
  checks,
  invariants: {
    ...(migration ? {
      preRows: migration.pre.rows,
      postRows: migration.post.rows,
      changedCounts: JSON.stringify(migration.pre.rows) === JSON.stringify(migration.post.rows) ? 0 : 1,
      preOwners: migration.pre.owners,
      postOwners: migration.post.owners,
      changedOwners: JSON.stringify(migration.pre.owners) === JSON.stringify(migration.post.owners) ? 0 : 1,
      preActiveDeleted: migration.pre.activeDeleted,
      postActiveDeleted: migration.post.activeDeleted,
      changedActiveDeleted: JSON.stringify(migration.pre.activeDeleted) === JSON.stringify(migration.post.activeDeleted) ? 0 : 1,
      foreignKeyViolations: migration.post.foreignKeyViolations,
      invalidJson: migration.post.invalidJson,
      templateVersions: migration.post.templateVersions,
      activeRuns: migration.post.activeRuns,
      lifecycle: migration.post.lifecycle,
      prePreservedRows: migration.pre.preservedRows,
      postPreservedRows: migration.post.preservedRows,
      prePreservationHash: migration.pre.preservationHash,
      postPreservationHash: migration.post.preservationHash,
      preservationDifferences: migration.comparison.differences,
      preIdentityRows: migration.pre.identityRows,
      postIdentityRows: migration.post.identityRows,
      preIdentityHash: migration.pre.identityHash,
      postIdentityHash: migration.post.identityHash,
    } : {
      migrationFailure,
      changedCounts: "unknown",
      changedOwners: "unknown",
      changedActiveDeleted: "unknown",
      foreignKeyViolations: "unknown",
      invalidJson: "unknown",
    }),
  },
  teardown: {
    leakedUsers: fixtureTeardown.leakedUsers,
    leakedTemplates: fixtureTeardown.leakedTemplates,
    leakedRuns: fixtureTeardown.leakedRuns,
    leakedSmokeStatePaths: browserTeardown.leakedStatePaths,
    verdict:
      fixtureTeardown.verdict === "pass" && browserTeardown.verdict === "pass"
        ? "pass"
        : "fail",
  },
  browserEvidence: {
    applicable: true,
    verdict: browserFailure ? "fail" : "pass",
    failure: browserFailure,
    failureArtifacts: browserFailure
      ? collectBrowserFailureArtifacts(path.join(repoRoot, "tests/test-results"))
      : [],
  },
  }),
  coverage,
  scenarioEvidence: readIntegrationScenarios(scenarioDirectory),
  authenticatedRehearsal,
  candidateAuthenticated,
  routeCoverage,
  routeNegativePassed,
  runContext: { mode: nonGating ? "non-gating" : "gating", repositoryRoot: startGitState.repositoryRoot, ...immutableRun },
};
const markdown = renderDataRegressionMarkdown(report);
const paths = writeDataCheckReports({
  name: "data-regression-suite",
  report,
  summary: markdown,
  reportDirectory,
});
console.log(markdown);
console.log(`Reports: ${paths.markdown}, ${paths.json}, ${paths.junit}; raw test report: ${rawVitestReport}`);
if (report.verdict !== "pass") process.exitCode = 1;
