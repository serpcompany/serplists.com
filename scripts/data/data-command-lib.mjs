import {
  chmodSync,
  closeSync,
  existsSync,
  fsyncSync,
  fstatSync,
  ftruncateSync,
  lstatSync,
  mkdirSync,
  openSync,
  readFileSync,
  readdirSync,
  realpathSync,
  unlinkSync,
  writeFileSync,
  writeSync,
} from "node:fs";
import path from "node:path";
import { createHash } from "node:crypto";
import { parsePendingMigrationNames } from "./pending-migrations-lib.mjs";
import { withPreparedRecoveryImport } from "./recovery-restore-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { wrapCanarySubprocessFailure } from "./canary-diagnostics.mjs";
import { migrationRangesEqual } from "./migration-range-lib.mjs";
import { validateQueryResultEnvelopes } from './d1-query-envelope.mjs';

import {
  loadEnvironmentInventory,
  resolveEnvironmentIdentity,
  validateEnvironmentInventory,
} from "./environment-identity-lib.mjs";
import { buildDataOperationPlan, buildRehearsalCreatePlan, validateRehearsalRecoveryExportRange } from "./data-operations-lib.mjs";
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

function recoveryExportReportContext({ argv, repoRoot, gitCommit, env }) {
  // Recover each field independently before the strict parser or planner throws.
  // Duplicate/missing values and rejected metadata are never echoed into reports.
  const arg = name => {
    const indexes = argv.flatMap((value, index) => value === name ? [index] : []);
    const value = indexes.length === 1 ? argv[indexes[0] + 1] : undefined;
    return value && !value.startsWith('--') ? value : undefined;
  };
  const environment = arg('--environment');
  const binding = argv.includes('--binding') ? arg('--binding') : 'DB';
  const context = {
    target: { environment: ['local', 'staging', 'rehearsal', 'production'].includes(environment) ? environment : 'unknown', binding: binding === 'DB' ? 'DB' : 'unknown', databaseName: 'unknown', databaseId: 'unknown' },
    targetIdentitySource: 'unknown', remoteIdentity: null,
    migrationRange: { from: 'invalid', to: 'invalid' },
  };
  try {
    const inventory = loadEnvironmentInventory({ repoRoot });
    validateEnvironmentInventory({ inventory, wranglerToml: readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8') });
    if (context.target.environment === 'unknown' || context.target.binding === 'unknown' || !arg('--database-name') || !arg('--database-id')) throw new Error('Incomplete requested identity.');
    const identity = resolveEnvironmentIdentity({ environment, inventory, databaseName: arg('--database-name'), databaseId: arg('--database-id') });
    context.target.databaseName = identity.databaseName;
    context.target.databaseId = identity.databaseId;
    context.targetIdentitySource = 'locally-validated-request';
  } catch { /* Keep only validated labels; no rejected identifiers or errors. */ }
  try {
    const policy = loadSanitizerPolicy({ repoRoot });
    if (!policy.allowedAccessOwners.includes(env.DATA_APPROVER_IDENTITY)) throw new Error('Untrusted workflow owner.');
    assertWorkflowRequestContext({ env, gitCommit, targetEnvironment: 'rehearsal', requestedApproverIdentity: env.DATA_APPROVER_IDENTITY });
    context.migrationRange = validateRehearsalRecoveryExportRange({ repoRoot, range: { from: env.MIGRATION_FROM, to: env.MIGRATION_TO } });
  } catch { /* Missing, invalid or untrusted workflow metadata cannot imply none. */ }
  return context;
}

function resolveEvidencePath(repoRoot, value) {
  if (!value) throw new Error("Remote rehearsal mutation requires --creation-evidence.");
  const resolved = path.resolve(repoRoot, value);
  const root = path.join(repoRoot, "tmp/data-reports");
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) throw new Error("Creation evidence must stay under tmp/data-reports/.");
  return resolved;
}

// Creation owns a fresh receipt before allocating remotely. Keep its descriptor
// open, and reject replaced files/parents instead of following a new destination.
function reserveCreationReceipt(repoRoot, value) {
  if (typeof value !== 'string' || !value.length || /[\x00-\x1f\x7f]/.test(value)) throw new Error('Creation requires a valid --evidence destination.');
  const destination = resolveEvidencePath(repoRoot, value);
  if (destination === path.join(repoRoot, 'tmp/data-reports')) throw new Error('Creation evidence requires a new file.');
  const directory = path.dirname(destination);
  const canonicalRoot = realpathSync(repoRoot);
  let current = repoRoot;
  for (const part of path.relative(repoRoot, directory).split(path.sep)) {
    current = path.join(current, part);
    if (!existsSync(current)) mkdirSync(current, { mode: 0o700 });
    if (!lstatSync(current).isDirectory() || lstatSync(current).isSymbolicLink()) throw new Error('Creation evidence parents must be real directories.');
  }
  const fd = openSync(destination, 'wx', 0o600);
  const original = fstatSync(fd);
  return {
    close: () => closeSync(fd),
    persist: receipt => {
      const current = lstatSync(destination);
      if (current.isSymbolicLink() || !current.isFile() || current.dev !== original.dev || current.ino !== original.ino ||
          realpathSync(directory) !== path.join(canonicalRoot, path.relative(repoRoot, directory))) throw new Error('Creation evidence destination changed.');
      const bytes = Buffer.from(`${JSON.stringify(receipt, null, 2)}\n`);
      let offset = 0;
      while (offset < bytes.length) offset += writeSync(fd, bytes, offset, bytes.length - offset, offset);
      ftruncateSync(fd, bytes.length);
      fsyncSync(fd);
    },
  };
}

function assertIsolatedCreationIdentity(identity, inventory) {
  resolveEnvironmentIdentity({ environment: 'rehearsal', inventory, ...identity });
  if (Object.entries(inventory.environments).some(([environment, entry]) => environment !== 'rehearsal' &&
      entry.databaseId.toLowerCase() === identity.databaseId.toLowerCase())) throw new Error('Creation identity is not isolated.');
}

function validatedCreationResponse(output, databaseName, inventory, { jsonOnly = false } = {}) {
  // Do not treat an arbitrary UUID in provider chatter as ownership evidence.
  let identity;
  if (jsonOnly || /^\s*[\[{]/.test(output)) {
    // Shared validation is authoritative for JSON, including rejected status
    // and duplicate keys. Never retry rejected JSON as creation text.
    identity = extractD1Identity(output);
  } else {
    const names = [...String(output).matchAll(/^\s*database_name\s*=\s*"([^"]+)"\s*$/gm)];
    const ids = [...String(output).matchAll(/^\s*database_id\s*=\s*"([^"]+)"\s*$/gm)];
    if (names.length !== 1 || ids.length !== 1) throw new Error('Creation response identity could not be validated.');
    identity = { databaseName: names[0][1], databaseId: ids[0][1] };
  }
  if (identity.databaseName !== databaseName) throw new Error('Creation response name mismatch.');
  assertIsolatedCreationIdentity(identity, inventory);
  return identity;
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
  } catch {
    throw new Error("Could not parse live D1 identity JSON; refusing to continue.");
  }
  const liveDatabaseId = liveIdentity.databaseId;
  const liveDatabaseName = liveIdentity.databaseName;
  if (liveDatabaseId !== expected.databaseId || liveDatabaseName !== expected.databaseName) {
    throw new Error(
      "Live database identity mismatch; refusing to continue.",
    );
  }
}

export function assertFixtureResults(output, expectedCounts) {
  const validCount = value => Number.isSafeInteger(value) && value >= 0;
  const canonicalName = name => name === 'checklist_runs' ? 'checklistRuns' : name;
  if (!expectedCounts || ![Object.prototype, null].includes(Object.getPrototypeOf(expectedCounts))) {
    throw new Error('Invalid expected fixture count contract.');
  }
  const expectedEntries = Object.entries(expectedCounts);
  const expectedNames = new Set(expectedEntries.map(([name]) => canonicalName(name)));
  if (Reflect.ownKeys(expectedCounts).length !== expectedEntries.length ||
      expectedEntries.some(([name, count]) => !name.length || !validCount(count)) ||
      expectedNames.size !== expectedEntries.length) {
    throw new Error('Invalid expected fixture count contract.');
  }
  const rows = validateQueryResultEnvelopes(output, 'Fixture verification').flatMap(entry => entry.results);
  const observed = new Map();
  for (const row of rows) {
    const name = canonicalName(row.fixture_table);
    if (typeof name !== 'string' || !expectedNames.has(name) || observed.has(name) || !validCount(row.fixture_rows)) {
      throw new Error('Invalid or duplicate fixture verification result.');
    }
    observed.set(name, row.fixture_rows);
  }
  for (const [name, expected] of expectedEntries) {
    const count = observed.get(canonicalName(name));
    if (count !== expected) {
      throw new Error(`Fixture verification failed: ${name} expected ${expected}, received ${count ?? "missing"}.`);
    }
  }
  return Object.fromEntries(expectedEntries.map(([name]) => [name, observed.get(canonicalName(name))]));
}

function normalizePublicInvariantRows(rows, sqlFiles) {
  const expected = sqlFiles.flatMap(file => [...readFileSync(file, 'utf8').matchAll(/SELECT '([^']+)' AS invariant/g)].map(match => match[1]));
  if (rows.length !== expected.length || new Set(rows.map(row => row?.invariant)).size !== expected.length) throw new Error('Incomplete invariant result.');
  return [{ results: rows.map(row => {
    if (!expected.includes(row?.invariant) || !Number.isSafeInteger(row.total_rows) || row.total_rows < 0) throw new Error('Invalid invariant result.');
    return { invariant: row.invariant, total_rows: row.total_rows };
  }) }];
}

function publicInvariantResults(output, sqlFiles) {
  const rows = validateQueryResultEnvelopes(output, 'Invariant').flatMap(entry => entry.results);
  return normalizePublicInvariantRows(rows, sqlFiles);
}

export function runDataCommand({
  argv,
  repoRoot,
  gitCommit,
  now = new Date(),
  env = process.env,
  write,
  runCommand,
  onStage = () => {},
  onReportContext = () => {},
  onIdentityVerified = () => {},
}) {
  onStage('data-configuration');
  const exportContext = argv[0] === 'rehearsal-recovery-export' ? recoveryExportReportContext({ argv, repoRoot, gitCommit, env }) : null;
  if (exportContext) onReportContext(exportContext);
  const { operation, values, flags } = parseArgs(argv);
  if (!operation) throw new Error("A data operation is required.");

  if (operation === 'rehearsal-recovery-export') {
    if (exportContext.targetIdentitySource !== 'locally-validated-request') throw new Error('Invalid recovery export target metadata.');
    const migrationRange = validateRehearsalRecoveryExportRange({ repoRoot, range: { from: values['--migration-from'], to: values['--migration-to'] } });
    const reviewedRange = exportContext.migrationRange;
    if (!migrationRangesEqual(migrationRange, reviewedRange)) throw new Error('Recovery export range differs from the reviewed workflow range.');
  }

  const inventory = loadEnvironmentInventory({ repoRoot });
  validateEnvironmentInventory({
    inventory,
    wranglerToml: readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8"),
  });

  let plan;
  if (operation === "rehearsal-create") {
    if (flags.has('--execute') && (typeof gitCommit !== 'string' || !/^[0-9a-f]{40}$/.test(gitCommit) ||
        typeof env.GITHUB_RUN_ID !== 'string' || !/^[1-9][0-9]*$/.test(env.GITHUB_RUN_ID) ||
        (env.GITHUB_SHA !== undefined && env.GITHUB_SHA !== gitCommit) ||
        !(now instanceof Date) || !Number.isFinite(now.getTime()))) throw new Error('Creation requires valid run and commit attribution.');
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

  onStage('data-configuration', plan.report);
  write(JSON.stringify(plan.report, null, 2));

  if (!flags.has("--execute")) {
    write(JSON.stringify({
      dryRun: true,
      preflightCommand: plan.preflightCommand,
      invariantLedgerCommand: plan.invariantLedgerCommand,
      command: plan.command,
      commands: plan.commands,
      versionedInvariantCommands: plan.versionedInvariantCommands,
      fixtureVerificationCommand: plan.fixtureVerificationCommand,
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

  if (operation === 'rehearsal-create') {
    // All caller-controlled requirements must fail before create is invoked.
    const allowed = new Set(['--database-name', '--evidence', '--expected-database-id', '--execute']);
    const seen = new Set();
    for (const token of argv.slice(1).filter(token => token.startsWith('--'))) {
      if (!allowed.has(token) || seen.has(token)) throw new Error('Invalid or duplicate creation argument.');
      seen.add(token);
    }
    if ([...flags].some(flag => flag !== '--execute') || values['--execute']) throw new Error('Missing creation argument value.');
    if (values['--expected-database-id']) assertIsolatedCreationIdentity({ databaseName: plan.report.databaseName, databaseId: values['--expected-database-id'] }, inventory);
    const destination = reserveCreationReceipt(repoRoot, values['--evidence']);
    const receipt = {
      schemaVersion: 1, verdict: 'fail', commit: gitCommit, runId: env.GITHUB_RUN_ID,
      attribution: 'unverified-request-metadata', createdAt: now.toISOString(),
      target: { environment: 'rehearsal', binding: 'DB', databaseName: plan.report.databaseName, databaseId: 'unknown' },
      migrationRange: plan.report.migrationRange,
      creationStatus: 'not-attempted', creationResponse: null, remoteIdentity: null,
      cleanup: 'requires-separate-authorization-and-identity-verification',
    };
    const publish = () => onReportContext({ target: { ...receipt.target }, migrationRange: receipt.migrationRange, creationReceipt: structuredClone(receipt) });
    let creationStage = 'data-configuration';
    try {
      publish();
      destination.persist(receipt);
      creationStage = 'data-create'; onStage(creationStage);
      receipt.creationStatus = 'outcome-unknown'; publish();
      const response = runCommand(plan.command);
      receipt.creationStatus = 'command-completed-identity-unverified'; publish();
      receipt.creationResponse = validatedCreationResponse(response, plan.report.databaseName, inventory);
      receipt.creationStatus = 'response-validated'; publish();
      // Persist the response before the independent lookup can fail.
      creationStage = 'data-reporting'; onStage(creationStage);
      destination.persist(receipt);
      creationStage = 'data-identity'; onStage(creationStage);
      if (values['--expected-database-id'] && values['--expected-database-id'] !== receipt.creationResponse.databaseId) throw new Error('Created rehearsal database ID does not match expected identity.');
      const info = runCommand(['pnpm', 'exec', 'wrangler', 'd1', 'info', plan.report.databaseName, '--json']);
      // Require a single valid isolated identity, then compare exact name/UUID.
      const observed = validatedCreationResponse(info, plan.report.databaseName, inventory, { jsonOnly: true });
      if (observed.databaseId !== receipt.creationResponse.databaseId) throw new Error('Live database identity mismatch.');
      receipt.remoteIdentity = observed;
      receipt.target.databaseId = observed.databaseId;
      publish();
      creationStage = 'data-reporting'; onStage(creationStage);
      destination.persist({ ...receipt, verdict: 'pass' });
      receipt.verdict = 'pass'; publish();
      const output = JSON.stringify({ createdIdentity: { environment: 'rehearsal', ...observed } }, null, 2);
      write(output);
      return { executed: true, plan, output };
    } catch (error) {
      receipt.verdict = 'fail'; receipt.failedStage = creationStage;
      publish();
      try { destination.persist(receipt); }
      catch { receipt.persistence = 'failed'; publish(); }
      const failure = wrapCanarySubprocessFailure(creationStage, error);
      // Library callers also retain cleanup data when no file can be written.
      failure.creationReceipt = structuredClone(receipt);
      throw failure;
    } finally { destination.close(); }
  }

  const assertCurrentIdentity = () => {
    if (!plan.preflightCommand) return;
    onStage('data-identity');
    try {
      const identityOutput = runCommand(plan.preflightCommand);
      assertLiveIdentity({ output: identityOutput, expected: plan.report });
      if (exportContext) onIdentityVerified({ databaseName: plan.report.databaseName, databaseId: plan.report.databaseId });
    } catch (error) { throw wrapCanarySubprocessFailure('data-identity', error); }
  };
  const runIdentityBound = (command, { after = true } = {}) => {
    assertCurrentIdentity();
    const stage = command.includes('time-travel') ? 'data-bookmark'
      : command.includes('export') ? 'data-export'
      : command.includes('create') ? 'data-create'
      : command.includes('delete') ? 'data-delete'
      : command.includes('list') ? 'data-migration-list'
      : command.some(part => part.includes('SELECT id, name FROM d1_migrations')) ? 'data-ledger'
      : operation === 'recovery-restore' ? 'data-restore'
      : ['migration-apply', 'rehearsal-baseline'].includes(operation) ? 'data-migration-apply' : 'data-query';
    onStage(stage);
    let result;
    try { result = runCommand(command); }
    catch (error) { throw wrapCanarySubprocessFailure(stage, error); }
    if (after) assertCurrentIdentity();
    onStage(stage);
    return result;
  };
  if (plan.preconditionCommand) {
    const rows = validateQueryResultEnvelopes(runIdentityBound(plan.preconditionCommand), 'Empty catalog').flatMap(entry => entry.results);
    if (rows.length !== 1 || rows[0]?.total_objects !== 0) {
      throw new Error("Remote rehearsal mutation requires a newly created empty database catalog and migration ledger.");
    }
  }
  if (plan.rawOutputPath) mkdirSync(path.dirname(plan.rawOutputPath), { recursive: true });
  let invariantContext;
  let invariantSqlFiles;
  let output;
  if (operation === "invariant-capture") {
    const appliedMigrations = parseAppliedMigrationLedger(runIdentityBound(plan.invariantLedgerCommand));
    const selectedFiles = selectInvariantSqlFiles({ appliedMigrations });
    const repositoryMigrations = readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name));
    if (appliedMigrations.some(name => !repositoryMigrations.includes(name))) throw new Error('Unknown applied migration.');
    invariantSqlFiles = selectedFiles.map(entry => entry.path);
    invariantContext = {
      appliedThrough: appliedMigrations.at(-1),
      sqlVersions: selectedFiles.map((entry) => entry.minimumMigration),
    };
    const outputs = [JSON.stringify(publicInvariantResults(runIdentityBound(plan.command), [selectedFiles[0].path]))];
    for (const definition of plan.versionedInvariantCommands) {
      if (appliedMigrations.includes(definition.minimumMigration)) {
        const sqlPath = definition.sqlPath;
        outputs.push(JSON.stringify(publicInvariantResults(runIdentityBound(definition.command), [sqlPath])));
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
        catch (error) { throw wrapCanarySubprocessFailure('data-restore', error); }
      },
    });
    output = JSON.stringify({ recoveryRestore: { ...plan.report.recoveryRestore, transformation: restored.metadata, preparedPlaintextCleanup: "pass" } });
    onStage('data-reporting');
    writeDataCheckReports({ name: "recovery-import", reportDirectory: resolveEvidencePath(repoRoot, values["--report-dir"] ?? "tmp/data-reports/rehearsal/recovery"),
      report: { verdict: "pass", commit: gitCommit, target: plan.report, transformation: restored.metadata, preparedPlaintextCleanup: "pass" },
      summary: "PASS actual full-export import completed; prepared plaintext removed. Post-restore equality remains a separate blocking gate.",
    });
  } else if (operation === "rehearsal-recovery-export") {
    // Own only a new private file. Never normalize a full recovery export or
    // delete a pre-existing artifact. The workflow owns cleanup after restore.
    onStage('data-export');
    const directory = path.dirname(plan.outputPath);
    if (realpathSync(directory) !== path.join(realpathSync(repoRoot), path.relative(repoRoot, directory))) throw new Error('Recovery export directory must not traverse symlinks.');
    chmodSync(directory, 0o700);
    writeFileSync(plan.outputPath, '', { flag: 'wx', mode: 0o600 });
    try {
      runIdentityBound(plan.command);
      chmodSync(plan.outputPath, 0o600);
      const bytes = readFileSync(plan.outputPath);
      if (!bytes.length) throw new Error('Missing export artifact.');
      output = JSON.stringify({ export: { bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), verification: 'separate-verification-required' } });
    } catch (error) {
      unlinkSync(plan.outputPath);
      throw error;
    }
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
    output = '';
  }
  if (operation === "fixture-setup" || operation === "fixture-teardown") {
    if (plan.fixtureVerificationCommand) {
      // An import summary confirms completion only; it cannot attest SELECT rows.
      validateQueryResultEnvelopes(output, 'Fixture import');
      output = runIdentityBound(plan.fixtureVerificationCommand);
    }
    const counts = assertFixtureResults(output, plan.report.expectedCounts);
    output = JSON.stringify({ fixtureCounts: Object.fromEntries(Object.keys(plan.report.expectedCounts).map(name => [name, counts[name]])) });
  }
  onStage('data-reporting');
  if (operation === 'identify') {
    if (plan.command) assertLiveIdentity({ output, expected: plan.report });
    output = JSON.stringify({ identity: { environment: plan.report.environment, binding: plan.report.binding, databaseName: plan.report.databaseName, databaseId: plan.report.databaseId } });
  } else if (operation === 'migration-ledger') {
    const names = readdirSync(path.join(repoRoot, 'db/migrations')).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    output = JSON.stringify({ pendingMigrations: parsePendingMigrationNames(output, names) });
  } else if (operation === 'recovery-bookmark') {
    const parsed = JSON.parse(output);
    // D1 Time Travel's documented bookmark representation; fail closed on new formats.
    // https://developers.cloudflare.com/d1/reference/time-travel/
    if (typeof parsed?.bookmark !== 'string' || !/^[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{8}-[0-9a-f]{32}$/.test(parsed.bookmark)) throw new Error('Malformed recovery bookmark.');
    output = JSON.stringify({ bookmark: parsed.bookmark });
  } else if (operation === 'invariant-capture') {
    // These are already validated, privacy-safe rows, not provider envelopes.
    output = JSON.stringify(normalizePublicInvariantRows(JSON.parse(output).flatMap(entry => entry.results), invariantSqlFiles));
  } else if (['export', 'recovery-export', 'sanitizer-source-export'].includes(operation)) {
    const bytes = readFileSync(plan.outputPath);
    if (!bytes.length) throw new Error('Missing export artifact.');
    output = JSON.stringify({ export: { outputPath: plan.outputPath, bytes: bytes.length, sha256: createHash('sha256').update(bytes).digest('hex'), verification: 'separate-verification-required' } });
  }
  if (invariantContext) write(JSON.stringify({ invariantContext }, null, 2));
  if (['migration-apply', 'rehearsal-import', 'rehearsal-teardown'].includes(operation)) {
    // These commands return human-oriented provider chatter, not data evidence.
    // The ordered ledger/invariant/restore gates remain separate authorities.
    output = JSON.stringify({ operation, status: 'command-completed', verification: 'separate-verification-required' });
  }
  if (output && operation !== 'rehearsal-create') write(output);
  return { executed: true, plan, output, invariantContext };
}
