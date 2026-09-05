import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, rmdirSync, rmSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { captureRepositoryGitState, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
import { resolveRehearsalPlan } from "./rehearsal-plan-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
import { authenticatedCoverageAssertions, validateAuthenticatedCandidateEvidence } from "./authenticated-coverage-lib.mjs";
import { validateSanitizedStateBinding } from "./sanitized-state-lib.mjs";

import { buildDataRegressionReport, renderDataRegressionMarkdown } from "./data-regression-report-lib.mjs";
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
const releaseRegressionLock = await acquireSmokeRunLock({
  lockPath: path.join(repoRoot, ".wrangler", "smoke-state.lock"),
});
process.once("exit", releaseRegressionLock);
const rehearsalRootExistedAtStart = existsSync(path.join(repoRoot, ".wrangler/rehearsals"));
const filesystemBefore = captureWorkspaceMetadata({ repoRoot });

function cleanupLocalRehearsalTestState() {
  const root = path.join(repoRoot, ".wrangler", "rehearsals");
  if (!existsSync(root)) return;
  for (const entry of readdirSync(root, { withFileTypes: true })) {
    if (entry.isDirectory() && /^(?:vitest|roundtrip)-/.test(entry.name)) {
      rmSync(path.join(root, entry.name), { recursive: true, force: true });
    }
  }
  if (!rehearsalRootExistedAtStart && readdirSync(root).length === 0) rmdirSync(root);
}

interface VitestAssertionResult {
  fullName?: string;
  status?: string;
  title?: string;
}

interface VitestFileResult {
  assertionResults?: VitestAssertionResult[];
}

interface VitestJsonReport {
  success?: boolean;
  testResults?: VitestFileResult[];
}

interface RegressionCheck {
  name: string;
  test: string;
  verdict: "pass" | "fail";
}

interface PlaywrightResult { status?: string }
interface PlaywrightTest { results?: PlaywrightResult[] }
interface PlaywrightSpec { title?: string; tests?: PlaywrightTest[] }
interface PlaywrightSuite { specs?: PlaywrightSpec[]; suites?: PlaywrightSuite[] }
interface PlaywrightJsonReport { suites?: PlaywrightSuite[] }

function collectPlaywrightSpecs(suites: PlaywrightSuite[]): PlaywrightSpec[] {
  return suites.flatMap((suite) => [
    ...(suite.specs ?? []),
    ...collectPlaywrightSpecs(suite.suites ?? []),
  ]);
}

const testFiles = [
  "scripts/data/authenticated-visibility.test.mjs",
  "scripts/data/production-shaped-migration-matrix.test.ts",
  "scripts/data/local-rehearsal-lifecycle.test.mjs",
  "scripts/data/teardown-probe.test.ts",
  "scripts/data/smoke-environment.test.mjs",
  "scripts/data/smoke-teardown.test.mjs",
  "scripts/data/workspace-cleanliness.test.mjs",
  "scripts/data/git-subprocess-env.test.mjs",
  "tests/unit/functions/api/templates-handler.test.ts",
  "tests/unit/functions/api/checklists-handler.test.ts",
  "tests/unit/functions/api/template-evolution-migration.test.ts",
  "tests/unit/scripts/data/schema-contract.test.ts",
];

const requiredChecks = [
  ["fresh migration chain", "accepts a fresh database built from the complete Wrangler migration chain"],
  ["exact pre-incident schema mismatch", "rejects the pre-incident migration 0023 schema"],
  ["0023 to 0024 invariant preservation", "preserves row counts ownership active/deleted state foreign keys JSON and versions"],
  ["existing nested identity preservation", "preserves every existing section item and sub-item identity across 0024"],
  ["deterministic legacy identity backfill", "backfills matching legacy identities and conservatively stales every linked snapshot"],
  ["multiple active completion states", "preserves multiple active runs at different completion progress and notes"],
  ["completed shared archived stale lifecycle", "keeps completed shared archived and stale lifecycle rows frozen and visible to recovery"],
  ["section item sub-item evolution", "applies section item and sub-item add rename reorder retire and remove only to active private runs"],
  ["explicit completed-run revalidation", "explicitly revalidates a completed run against the current template"],
  ["template optimistic concurrency", "reports a conflict when a template changes between the read and conditional write"],
  ["run optimistic concurrency", "reports a conflict when a run changes between the read and conditional write"],
  ["authenticated visibility evaluator", "passes when all account-owned database rows are present in the API payload"],
  ["authenticated false-empty detection", "fails when database rows exist but the API is incorrectly empty"],
  ["authenticated API error detection", "fails when account-owned rows exist but the API errors"],
  ["rollback recovery rehearsal", "round-trips a Wrangler data-only export through a fresh migrated database and invariants"],
  ["fixture teardown leak detection", "replays migrations, applies deterministic fixtures twice, and proves teardown leaves no rows"],
  ["observed fixture teardown counts", "reports actual remaining fixture rows after exact cleanup"],
  ["smoke child secret allowlist", "allowlists runtime variables and drops every developer/cloud/email secret sentinel"],
  ["smoke state observed teardown", "removes isolated state and reports observed zero leaks"],
  ["concurrent HEAD and worktree mutation detection", "deterministically fails a concurrent HEAD move and worktree mutation"],
  ["poisoned Git context isolation", "ignores poisoned repository, worktree, and index variables for HEAD and cleanliness"],
] as const;

mkdirSync(reportDirectory, { recursive: true });
let vitestResult: VitestJsonReport;
let commandFailure: string | null = null;
try {
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    [
      "exec", "vitest", "run", ...testFiles,
      "--reporter=json", `--outputFile=${rawVitestReport}`,
    ],
    { cwd: repoRoot, env: { ...sanitizedGitEnvironment(), DATA_REPORT_DIR: reportDirectory, DATA_REGRESSION_START_COMMIT: startCommit }, stdio: ["ignore", "inherit", "inherit"] },
  );
  vitestResult = JSON.parse(readFileSync(rawVitestReport, "utf8"));
} catch (error) {
  commandFailure = error instanceof Error ? error.message : String(error);
  try {
    vitestResult = JSON.parse(readFileSync(rawVitestReport, "utf8"));
  } catch {
    vitestResult = { success: false, testResults: [] };
  }
}
cleanupLocalRehearsalTestState();

const assertions = (vitestResult.testResults ?? []).flatMap(
  (result) => result.assertionResults ?? [],
);
const checks: RegressionCheck[] = requiredChecks.map(([name, title]) => {
  const matches = assertions.filter((assertion) =>
    String(assertion.fullName ?? assertion.title).includes(title),
  );
  return {
    name,
    test: title,
    verdict: matches.length > 0 && matches.every((assertion) => assertion.status === "passed")
      ? "pass"
      : "fail",
  };
});
checks.push({ name: "reviewed rehearsal coverage", test: "exact changed migration and maintenance artifacts have affected-table fixtures and invariants", verdict: rehearsalPlan ? "pass" : "fail" });
if (commandFailure) checks.push({
  name: "test command",
  test: "focused Vitest command completed",
  verdict: "fail",
});

let browserFailure: string | null = null;
let actualApplicationVisibilityPassed = false;
let candidateAuthenticated = { verdict: "fail", checks: {} } as Record<string, unknown>;
let authenticatedRehearsal = { applicable: false, verdict: "not-applicable" } as Record<string, unknown>;
const sanitizedPathArg = valueAfter("--sanitized");
const sanitizerManifestArg = valueAfter("--sanitizer-manifest");
let sanitizedArtifactSha256: string | null = null;
if ((sanitizedPathArg == null) !== (sanitizerManifestArg == null)) {
  browserFailure = "Sanitized rehearsal requires both --sanitized and --sanitizer-manifest.";
} else if (sanitizedPathArg && sanitizerManifestArg) {
  try {
    const sanitizedSql = readFileSync(path.resolve(repoRoot, sanitizedPathArg), "utf8");
    const manifest = JSON.parse(readFileSync(path.resolve(repoRoot, sanitizerManifestArg), "utf8"));
    validateSanitizedRehearsalArtifact({ sql: sanitizedSql, manifest, policy: loadSanitizerPolicy({ repoRoot }), now: new Date() });
    if (manifest.provenance.gitCommit !== startCommit) throw new Error("Sanitizer manifest commit does not match this candidate.");
    sanitizedArtifactSha256 = manifest.artifact.sha256;
    authenticatedRehearsal = { applicable: true, verdict: "fail", sanitizerArtifactSha256: sanitizedArtifactSha256 };
  } catch (error) { browserFailure = error instanceof Error ? error.message : String(error); }
}
let browserTeardown = {
  leakedStatePaths: 1,
  verdict: "fail",
};
if (existsSync(browserTeardownReportPath)) unlinkSync(browserTeardownReportPath);
if (existsSync(browserJsonReportPath)) unlinkSync(browserJsonReportPath);
try {
  execFileSync(
    process.platform === "win32" ? "pnpm.cmd" : "pnpm",
    ["run", "test:smoke"],
    {
      cwd: repoRoot,
      env: {
        ...sanitizedGitEnvironment(),
        PLAYWRIGHT_TEARDOWN_REPORT: browserTeardownReportPath,
        PLAYWRIGHT_JSON_REPORT: browserJsonReportPath,
        PLAYWRIGHT_SMOKE_LOCK_HELD: "1",
        DATA_REGRESSION_START_COMMIT: startCommit,
        PLAYWRIGHT_CANDIDATE_AUTH_PROOF: candidateAuthenticatedProofPath,
        ...(sanitizedArtifactSha256 && rehearsalPlan ? {
          PLAYWRIGHT_SANITIZED_REHEARSAL_SQL: path.resolve(repoRoot, sanitizedPathArg),
          PLAYWRIGHT_SANITIZER_SHA256: sanitizedArtifactSha256,
          PLAYWRIGHT_REHEARSAL_PROOF: authenticatedRehearsalProofPath,
          DATA_REGRESSION_MIGRATION_FROM: rehearsalPlan.migrationRange.from ?? "none",
          DATA_REGRESSION_MIGRATION_TO: rehearsalPlan.migrationRange.to ?? "none",
        } : {}),
      },
      stdio: ["ignore", "inherit", "inherit"],
    },
  );
  browserTeardown = JSON.parse(readFileSync(browserTeardownReportPath, "utf8"));
  if (browserTeardown.verdict !== "pass") {
    browserFailure = "Browser smoke state teardown reported leaked local state.";
  }
  const browserReport = JSON.parse(
    readFileSync(browserJsonReportPath, "utf8"),
  ) as PlaywrightJsonReport;
  const visibilitySpec = collectPlaywrightSpecs(browserReport.suites ?? [])
    .find((spec) => String(spec.title).includes(
      "authenticated account-owned D1 template is visible through API and dashboard",
    ));
  const visibilityPassed = visibilitySpec?.tests?.some((test) =>
    test.results?.some((result) => result.status === "passed"),
  );
  actualApplicationVisibilityPassed = visibilityPassed === true;
  if (!visibilityPassed) {
    browserFailure = "Actual Better Auth cookie/API/dashboard visibility journey was missing or failed.";
  }
  const candidateProof = JSON.parse(readFileSync(candidateAuthenticatedProofPath, "utf8"));
  const candidateChecks = candidateProof.checks ?? {};
  const candidateBound = candidateProof.verdict === "pass" && candidateProof.commit === startCommit && candidateChecks.templateRead === true && candidateChecks.templateWriteReadback === true && candidateChecks.runRead === true && candidateChecks.runWriteReadback === true;
  candidateAuthenticated = { ...candidateProof, verdict: candidateBound ? "pass" : "fail" };
  if (!candidateBound) browserFailure = "Authenticated candidate template/run read-write proof is incomplete.";
  if (sanitizedArtifactSha256 && rehearsalPlan) {
    const proof = JSON.parse(readFileSync(authenticatedRehearsalProofPath, "utf8"));
    const falseEmptyDetection = checks.find((check) => check.name === "authenticated false-empty detection")?.verdict;
    const apiErrorDetection = checks.find((check) => check.name === "authenticated API error detection")?.verdict;
    const combinedChecks = { ...proof.checks, falseEmptyDetection, apiErrorDetection };
    let strictChecks = false;
    try { validateAuthenticatedCandidateEvidence({ ...proof, checks: combinedChecks }, { requireDetectors: true }); strictChecks = true; } catch { strictChecks = false; }
    validateSanitizedStateBinding(proof.postMigrationState, proof.postMigrationState);
    const bound = strictChecks && proof.handlerStateReadback === true && proof.transformation?.verdict === "pass" && proof.postMigrationState.sourceSha256 === sanitizedArtifactSha256 && proof.commit === startCommit && proof.sanitizerArtifactSha256 === sanitizedArtifactSha256 && proof.migrationRange?.from === rehearsalPlan.migrationRange.from && proof.migrationRange?.to === rehearsalPlan.migrationRange.to;
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
  authenticatedRehearsal,
  candidateAuthenticated,
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
releaseRegressionLock();
if (report.verdict !== "pass") process.exitCode = 1;
