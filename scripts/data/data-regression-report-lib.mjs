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
    commit,
    workingTreeDirty,
    workingTreeDirtyPaths,
    workspaceCleanlinessVerdict,
    unexpectedFilesystemChanges,
    target,
    migrationRange,
    checks,
    invariants,
    teardown,
    browserEvidence,
    evidenceChecks,
    verdict,
  };
}

export function renderDataRegressionMarkdown(report) {
  const status = report.verdict.toUpperCase();
  const lines = [
    `# Data regression suite: ${status}`,
    "",
    `- Environment: ${report.target.environment}`,
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
