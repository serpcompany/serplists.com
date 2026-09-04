import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, readdirSync, unlinkSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { buildDataRegressionReport, renderDataRegressionMarkdown } from "./data-regression-report-lib.mjs";
import { loadEnvironmentInventory } from "./environment-identity-lib.mjs";
import { runProductionShapedMigrationMatrix } from "./production-shaped-migration-matrix";
import { writeDataCheckReports } from "./reporting.mjs";
import { runFixtureTeardownProbe } from "./teardown-probe";
import {
  captureWorkspaceMetadata,
  compareWorkspaceMetadata,
  evaluateWorkspaceCleanliness,
  parsePorcelainStatus,
} from "./workspace-cleanliness-lib.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const reportDirectory = path.resolve(
  repoRoot,
  process.argv.includes("--report-dir")
    ? process.argv[process.argv.indexOf("--report-dir") + 1]
    : "tmp/data-reports",
);
const rawVitestReport = path.join(reportDirectory, "data-regression-vitest.json");
const browserTeardownReportPath = path.join(reportDirectory, "browser-smoke-teardown.json");
const browserJsonReportPath = path.join(reportDirectory, "browser-smoke-playwright.json");
const reportRoot = path.join(repoRoot, "tmp", "data-reports");
if (
  reportDirectory !== reportRoot &&
  !reportDirectory.startsWith(`${reportRoot}${path.sep}`)
) {
  throw new Error(`Report directory must stay under ${reportRoot}.`);
}
const reportDirectoryRelative = path.relative(repoRoot, reportDirectory);
const filesystemBefore = captureWorkspaceMetadata({ repoRoot });

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
    { cwd: repoRoot, env: process.env, stdio: ["ignore", "inherit", "inherit"] },
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
if (commandFailure) checks.push({
  name: "test command",
  test: "focused Vitest command completed",
  verdict: "fail",
});

let browserFailure: string | null = null;
let actualApplicationVisibilityPassed = false;
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
        ...process.env,
        PLAYWRIGHT_TEARDOWN_REPORT: browserTeardownReportPath,
        PLAYWRIGHT_JSON_REPORT: browserJsonReportPath,
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
  migration = runProductionShapedMigrationMatrix();
} catch (error) {
  migrationFailure = error instanceof Error ? error.message : String(error);
  checks.push({
    name: "migration matrix execution",
    test: "production-shaped migration matrix completed",
    verdict: "fail",
  });
}
const inventory = loadEnvironmentInventory({ repoRoot });
const commit = execFileSync("git", ["rev-parse", "HEAD"], {
  cwd: repoRoot,
  encoding: "utf8",
}).trim();
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
const workingTreeDirtyPaths = parsePorcelainStatus(execFileSync("git", ["status", "--porcelain", "--untracked-files=all"], {
  cwd: repoRoot,
  encoding: "utf8",
}));
const filesystemChanges = compareWorkspaceMetadata({
  before: filesystemBefore,
  after: captureWorkspaceMetadata({ repoRoot }),
});
const workspaceCleanliness = evaluateWorkspaceCleanliness({
  ci: process.env.CI === "1" || process.env.CI === "true",
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
checks.push({
  name: "CI workspace cleanliness",
  test: "data regression execution leaves no unexpected tracked unignored or ignored paths",
  verdict: workspaceCleanliness.verdict === "fail" ? "fail" : "pass",
});
const report = buildDataRegressionReport({
  commit,
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
    from: "0023_add_sitemap_revision_state.sql",
    to: "0024_safe_template_evolution.sql",
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
});
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
