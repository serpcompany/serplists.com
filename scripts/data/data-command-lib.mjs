import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  unlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { withPreparedRecoveryImport } from "./recovery-restore-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";

import {
  loadEnvironmentInventory,
  resolveEnvironmentIdentity,
  validateEnvironmentInventory,
} from "./environment-identity-lib.mjs";
import { buildDataOperationPlan, buildRehearsalCreatePlan } from "./data-operations-lib.mjs";
import {
  compareMigrationLedger,
  parseAppliedMigrationLedger,
  selectInvariantSqlFiles,
} from "./invariant-capture-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import {
  assertStagingMutationWorkflowContext,
  assertWorkflowRequestContext,
} from "./workflow-request-context-lib.mjs";
import {
  loadSanitizerPolicy,
  normalizeRehearsalDataExport,
} from "./sanitizer-lib.mjs";

function parseArgs(argv) {
  const operation = argv[0];
  const values = {};
  const flags = new Set();
  for (let index = 1; index < argv.length; index += 1) {
    const token = argv[index];
    if (!token.startsWith("--")) throw new Error(`Unexpected argument: ${token}.`);
    const next = argv[index + 1];
    if (!next || next.startsWith("--")) {
      flags.add(token);
    } else {
      values[token] = next;
      index += 1;
    }
  }
  return { operation, values, flags };
}

function resolveEvidencePath(repoRoot, value) {
  if (!value) throw new Error("Remote rehearsal mutation requires --creation-evidence.");
  const resolved = path.resolve(repoRoot, value);
  const root = path.join(repoRoot, "tmp/data-reports");
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Creation evidence must stay under tmp/data-reports/.");
  return resolved;
}

export function validateRehearsalCreationEvidence({ evidence, expected, gitCommit, runId, now }) {
  const createdAt = new Date(evidence?.createdAt);
  if (evidence?.schemaVersion !== 1 || evidence?.verdict !== "pass" || evidence?.commit !== gitCommit || evidence?.runId !== runId || evidence?.target?.environment !== "rehearsal" || evidence?.target?.binding !== "DB" || evidence?.target?.databaseName !== expected.databaseName || evidence?.target?.databaseId !== expected.databaseId || !Number.isFinite(createdAt.getTime()) || createdAt > now || createdAt < new Date(now.getTime() - 60 * 60 * 1000)) throw new Error("Rehearsal database creation evidence is missing, stale, or does not match this run, commit, and target.");
  return evidence;
}

export function assertLiveIdentity({ output, expected }) {
  let liveIdentity;
  try {
    liveIdentity = extractD1Identity(output);
  } catch (error) {
    throw new Error("Could not parse live D1 identity JSON; refusing to continue.", { cause: error });
  }
  const liveDatabaseId = liveIdentity.databaseId;
  const liveDatabaseName = liveIdentity.databaseName;
  if (liveDatabaseId !== expected.databaseId || liveDatabaseName !== expected.databaseName) {
    throw new Error(
      `Live database identity mismatch: expected ${expected.databaseName} (${expected.databaseId}), received ${liveDatabaseName ?? "unknown"} (${liveDatabaseId ?? "unknown"}).`,
    );
  }
}

export function assertFixtureResults(output, expectedCounts) {
  let parsed;
  try {
    parsed = JSON.parse(output);
  } catch {
    throw new Error("Could not parse fixture verification JSON; refusing to continue.");
  }
  const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry?.results ?? []);
  const names = { users: "users", templates: "templates", checklist_runs: "checklistRuns" };
  const observed = Object.fromEntries(
    rows
      .filter((row) => typeof row?.fixture_table === "string")
      .map((row) => [names[row.fixture_table] ?? row.fixture_table, Number(row.fixture_rows)]),
  );
  for (const [name, expected] of Object.entries(expectedCounts)) {
    if (observed[name] !== expected) {
      throw new Error(`Fixture verification failed: ${name} expected ${expected}, received ${observed[name] ?? "missing"}.`);
    }
  }
  return observed;
}

export function runDataCommand({
  argv,
  repoRoot,
  gitCommit,
  now = new Date(),
  env = process.env,
  write,
  runCommand,
}) {
  const { operation, values, flags } = parseArgs(argv);
  if (!operation) throw new Error("A data operation is required.");

  const inventory = loadEnvironmentInventory({ repoRoot });
  validateEnvironmentInventory({
    inventory,
    wranglerToml: readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8"),
  });

  let plan;
  if (operation === "rehearsal-create") {
    plan = buildRehearsalCreatePlan({
      databaseName: values["--database-name"],
      inventory,
      repoRoot,
      gitCommit,
    });
  } else {
    const environment = values["--environment"];
    const identity = resolveEnvironmentIdentity({
      environment,
      inventory,
      databaseId: values["--database-id"],
      databaseName: values["--database-name"],
    });
    const manifest = values["--manifest"]
      ? JSON.parse(readFileSync(path.resolve(values["--manifest"]), "utf8"))
      : undefined;
    const importSql = values["--input"]
      ? readFileSync(path.resolve(values["--input"]), "utf8")
      : undefined;
    if (["rehearsal-baseline", "recovery-restore"].includes(operation)) {
      const evidencePath = resolveEvidencePath(repoRoot, values["--creation-evidence"]);
      validateRehearsalCreationEvidence({ evidence: JSON.parse(readFileSync(evidencePath, "utf8")), expected: identity, gitCommit, runId: env.GITHUB_RUN_ID, now });
    }
    plan = buildDataOperationPlan({
      operation,
      identity,
      repoRoot,
      gitCommit,
      outputPath: values["--output"],
      importPath: values["--input"],
      importSql,
      importManifest: manifest,
      confirmationDatabaseId: values["--confirm-database-id"],
      persistTo: values["--persist-to"],
      beforeMigration: values["--before"],
      migrationRange: { from: values["--migration-from"], to: values["--migration-to"] },
      sourceSchema: values["--source-schema"],
      now,
    });
  }

  write(JSON.stringify(plan.report, null, 2));

  if (!flags.has("--execute")) {
    write(JSON.stringify({
      dryRun: true,
      preflightCommand: plan.preflightCommand,
      invariantLedgerCommand: plan.invariantLedgerCommand,
      command: plan.command,
      commands: plan.commands,
      versionedInvariantCommands: plan.versionedInvariantCommands,
      generalCliExecutable: plan.generalCliExecutable,
      requiresIssue97ExecutionBoundary: plan.requiresIssue97ExecutionBoundary,
      requiresWorkflowRequestContext: plan.requiresWorkflowRequestContext,
      requiresStagingExecutionBoundary: plan.requiresStagingExecutionBoundary,
    }, null, 2));
    return { executed: false, plan };
  }

  if (plan.generalCliExecutable === false) {
    throw new Error(
      "The general data CLI is plan-only for production recovery; issue #97 must provide the non-forgeable production execution boundary.",
    );
  }

  if (plan.requiresWorkflowRequestContext) {
    const policy = loadSanitizerPolicy({ repoRoot });
    const approverIdentity = plan.report.sanitizedImport?.accessOwner
      ?? values["--approver-identity"];
    if (!policy.allowedAccessOwners.includes(approverIdentity)) {
      throw new Error("Workflow request metadata requires an allowlisted sanitizer access owner.");
    }
    plan.report.workflowRequestMetadata = assertWorkflowRequestContext({
      env,
      gitCommit,
      targetEnvironment: plan.report.environment,
      requestedApproverIdentity: approverIdentity,
    });
  }
  if (
    (plan.mutates || plan.requiresConfirmation) &&
    plan.report.environment !== "local" &&
    operation !== "rehearsal-create" &&
    values["--confirm-database-id"] !== plan.report.databaseId
  ) {
    throw new Error("Remote writes require --confirm-database-id matching the reported database ID.");
  }
  if (plan.requiresStagingExecutionBoundary) {
    plan.report.stagingWorkflow = assertStagingMutationWorkflowContext({ env, gitCommit });
  }

  const assertCurrentIdentity = () => {
    if (!plan.preflightCommand) return;
    const identityOutput = runCommand(plan.preflightCommand);
    assertLiveIdentity({ output: identityOutput, expected: plan.report });
  };
  const runIdentityBound = (command, { after = true } = {}) => {
    assertCurrentIdentity();
    const result = runCommand(command);
    if (after) assertCurrentIdentity();
    return result;
  };
  if (plan.preconditionCommand) {
    const parsed = JSON.parse(runIdentityBound(plan.preconditionCommand));
    const rows = (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry?.results ?? []);
    if (rows.length !== 1 || Number(rows[0]?.total_objects) !== 0) {
      throw new Error("Remote rehearsal mutation requires a newly created empty database catalog and migration ledger.");
    }
  }
  if (plan.rawOutputPath) mkdirSync(path.dirname(plan.rawOutputPath), { recursive: true });
  let invariantContext;
  let output;
  if (operation === "invariant-capture") {
    const appliedMigrations = parseAppliedMigrationLedger(runIdentityBound(plan.invariantLedgerCommand));
    const selectedFiles = selectInvariantSqlFiles({ appliedMigrations });
    invariantContext = {
      appliedThrough: appliedMigrations.at(-1),
      sqlVersions: selectedFiles.map((entry) => entry.minimumMigration),
    };
    write(JSON.stringify({ invariantContext }, null, 2));
    const outputs = [runIdentityBound(plan.command)];
    for (const definition of plan.versionedInvariantCommands) {
      if (appliedMigrations.includes(definition.minimumMigration)) {
        outputs.push(runIdentityBound(definition.command));
      }
    }
    const combined = outputs.flatMap((entry) => {
      const parsed = JSON.parse(entry);
      return Array.isArray(parsed) ? parsed : [parsed];
    });
    output = JSON.stringify(combined, null, 2);
  } else if (operation === "rehearsal-baseline") {
    for (const command of plan.commands) runIdentityBound(command);
    const appliedMigrations = parseAppliedMigrationLedger(runIdentityBound(plan.invariantLedgerCommand), {
      allowEmpty: plan.expectedAppliedMigrations.length === 0,
    });
    const ledger = compareMigrationLedger({
      repositoryMigrations: plan.expectedAppliedMigrations,
      appliedMigrations,
    });
    if (ledger.verdict !== "pass") throw new Error(`Rehearsal baseline ledger verification failed: ${JSON.stringify(ledger)}.`);
    output = JSON.stringify({ baseline: plan.report.baseline, ledger }, null, 2);
  } else if (operation === "recovery-restore") {
    const restored = withPreparedRecoveryImport({
      inputPath: path.resolve(repoRoot, values["--input"]),
      expectedSourceSha256: plan.report.recoveryRestore.transformation.sourceSha256,
      execute: (file) => {
        const command = [...plan.command];
        command[command.indexOf("--file") + 1] = file;
        try { return runIdentityBound(command); }
        catch { throw new Error("Recovery import failed; plaintext diagnostics suppressed."); }
      },
    });
    output = JSON.stringify({ recoveryRestore: { ...plan.report.recoveryRestore, transformation: restored.metadata, preparedPlaintextCleanup: "pass" } });
    writeDataCheckReports({ name: "recovery-import", reportDirectory: resolveEvidencePath(repoRoot, values["--report-dir"] ?? "tmp/data-reports/rehearsal/recovery"),
      report: { verdict: "pass", commit: gitCommit, target: plan.report, transformation: restored.metadata, preparedPlaintextCleanup: "pass" },
      summary: "PASS actual full-export import completed; prepared plaintext removed. Post-restore equality remains a separate blocking gate.",
    });
  } else {
    output = plan.command ? runIdentityBound(plan.command, { after: operation !== "rehearsal-teardown" && operation !== "rehearsal-create" }) : "";
  }
  if (operation === "rehearsal-export") {
    let normalized;
    try {
      normalized = normalizeRehearsalDataExport({
        repoRoot,
        rawExport: readFileSync(plan.rawOutputPath, "utf8"),
        migrationRange: { from: values["--migration-from"], to: values["--migration-to"] },
        sourceSchema: values["--source-schema"],
      });
      writeFileSync(plan.outputPath, normalized.sql, { encoding: "utf8", mode: 0o600 });
      chmodSync(plan.outputPath, 0o600);
    } finally {
      if (existsSync(plan.rawOutputPath)) unlinkSync(plan.rawOutputPath);
    }
    write(JSON.stringify({
      rehearsalExport: {
        outputPath: plan.outputPath,
        sourceSha256: normalized.sourceSha256,
        artifactSha256: normalized.artifactSha256,
        format: "data-only-source-derived-content-free",
      },
    }, null, 2));
  }
  if (operation === "fixture-setup" || operation === "fixture-teardown") {
    assertFixtureResults(output, plan.report.expectedCounts);
  }
  if (output) write(output);
  if (operation === "rehearsal-create") {
    const createdDatabaseId = /[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}/i.exec(output)?.[0];
    if (!createdDatabaseId) {
      throw new Error("Wrangler created a rehearsal but its exact database UUID could not be recorded.");
    }
    if (values["--expected-database-id"] && values["--expected-database-id"] !== createdDatabaseId) throw new Error("Created rehearsal database ID does not match --expected-database-id.");
    const createdIdentityOutput = runCommand(["pnpm", "exec", "wrangler", "d1", "info", plan.report.databaseName, "--json"]);
    assertLiveIdentity({ output: createdIdentityOutput, expected: { ...plan.report, databaseId: createdDatabaseId } });
    const evidencePath = resolveEvidencePath(repoRoot, values["--evidence"]);
    const creationEvidence = { schemaVersion: 1, verdict: "pass", commit: gitCommit, runId: env.GITHUB_RUN_ID, createdAt: now.toISOString(), target: { environment: "rehearsal", binding: "DB", databaseName: plan.report.databaseName, databaseId: createdDatabaseId } };
    mkdirSync(path.dirname(evidencePath), { recursive: true });
    writeFileSync(evidencePath, `${JSON.stringify(creationEvidence, null, 2)}\n`, { mode: 0o600 });
    write(JSON.stringify({
      createdIdentity: {
        environment: "rehearsal",
        databaseName: plan.report.databaseName,
        databaseId: createdDatabaseId,
      },
    }, null, 2));
  }
  return { executed: true, plan, output, invariantContext };
}
