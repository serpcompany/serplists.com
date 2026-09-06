#!/usr/bin/env node
import { normalizeMigrationRange, migrationRangeForReport } from "./migration-range-lib.mjs";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { loadEnvironmentInventory, resolveEnvironmentIdentity, resolveDirectCheckIdentity } from './environment-identity-lib.mjs';
import { evaluateDeploymentSmoke, exerciseControlledCanaryMutation } from "./deployment-smoke-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from "./canary-diagnostics.mjs";
import { parseStrictJson } from "./strict-json-lib.mjs";
import { validateQueryResultEnvelopes } from './d1-query-envelope.mjs';
import { validateCanaryTarget, validateCanaryDestinations, validateCanaryObservation } from './canary-target-lib.mjs';

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

function failureContext() {
  // Rejected CLI arguments are not evidence. Validate each retained field
  // independently; never fall back to first-match argument parsing here.
  const argv = process.argv.slice(2);
  const unique = option => {
    const indices = argv.flatMap((value, index) => value === option || value.startsWith(option + '=') ? [index] : []);
    if (indices.length !== 1 || argv[indices[0]] !== option) return undefined;
    const value = argv[indices[0] + 1];
    return value && !value.startsWith('--') ? value : undefined;
  };
  const environment = ['staging', 'production'].find(value => value === unique('--environment')) ?? 'unknown';
  const target = { environment, binding: 'unknown', databaseName: 'unknown', databaseId: 'unknown' };
  try {
    const repoRoot = fileURLToPath(new URL('../../', import.meta.url));
    // This read-only resolver validates the inventory and all configured DB
    // bindings. The staging default here validates config, not the request.
    resolveDirectCheckIdentity({ repoRoot, environment: 'staging', binding: 'DB', local: false, remote: true, argv: [] });
    const inventory = loadEnvironmentInventory({ repoRoot });
    if (unique('--binding') === inventory.binding) target.binding = inventory.binding;
    if (environment !== 'unknown') {
      const configured = resolveEnvironmentIdentity({ environment, inventory });
      if (unique('--database-name') === configured.databaseName) target.databaseName = configured.databaseName;
      if (unique('--database-id') === configured.databaseId) target.databaseId = configured.databaseId;
    }
  } catch { /* Unavailable or inconsistent local configuration is not evidence. */ }
  let migrationRange = { from: 'invalid', to: 'invalid' };
  try {
    const range = normalizeMigrationRange({ from: unique('--migration-from'), to: unique('--migration-to') });
    const files = readdirSync(new URL('../../db/migrations/', import.meta.url));
    if (range.from === null || (files.includes(range.from) && files.includes(range.to))) migrationRange = range;
  } catch { /* Keep the pair invalid; never invent an empty reviewed range. */ }
  const sha = process.env.GITHUB_SHA;
  const commit = typeof sha === 'string' && sha.length === 40 && /^[a-f0-9]{40}$/.test(sha) ? sha : 'unknown';
  const name = { staging: 'staging-postdeploy-smoke', production: 'production-postdeploy-smoke', unknown: 'unknown-postdeploy-smoke' }[environment];
  const reportDirectory = unique('--report-dir') ?? ({ staging: 'tmp/data-reports/staging', production: 'tmp/data-reports/production', unknown: 'tmp/data-reports/unknown' }[environment]);
  return { commit, target, migrationRange, name, reportDirectory };
}
function rowsFromD1(output, { templateId, runId }) {
  const parsed = parseStrictJson(output);
  const entries = validateQueryResultEnvelopes(parsed, 'Canary query');
  // This UNION query must return exactly one successful result set; never
  // flatten away failed statements before checking canary prerequisites.
  if (entries.length !== 1) {
    throw new Error("Canary query result envelope is failed or malformed.");
  }
  const rows = entries[0].results;
  const columns = ["kind", "id", "title", "version", "progress", "revision"];
  const version = value => Number.isSafeInteger(value) && value >= 0;
  if (rows.length !== 2 || rows.some(row =>
      Object.keys(row).length !== columns.length || columns.some(column => !Object.hasOwn(row, column)) ||
      typeof row.title !== "string" ||
      (row.kind === "template"
        ? row.id !== templateId || !version(row.version) || row.progress !== null || row.revision !== null
        : row.kind === "run"
          ? row.id !== runId || row.version !== null || !version(row.revision) ||
            typeof row.progress !== "number" || !Number.isFinite(row.progress) || row.progress < 0 || row.progress > 100
          : true)) || new Set(rows.map(row => row.kind)).size !== 2) {
    throw new Error("Canary query must contain exactly the designated template and run with complete row shapes.");
  }
  return rows;
}
async function fetchJson(url, cookie, init = {}) {
  const response = await fetch(url, { ...init, headers: { cookie, accept: "application/json", "content-type": "application/json", ...(init.headers ?? {}) }, redirect: "error" });
  let rows = null;
  try { rows = await response.json(); } catch { rows = null; }
  return { status: response.status, rows };
}

const environment = arg("--environment") ?? "unknown";
const databaseName = arg("--database-name") ?? "unknown";
const databaseId = arg("--database-id") ?? "unknown";
const deploymentUrl = arg("--deployment-url") ?? "";
const customDomain = arg("--custom-domain") ?? "";
const ownerId = process.env.DATA_CANARY_OWNER_ID;
const cookie = process.env.DATA_CANARY_COOKIE;
const templateId = process.env.DATA_CANARY_TEMPLATE_ID;
const runId = process.env.DATA_CANARY_RUN_ID;
const mutationApproved = process.env.DATA_CANARY_MUTATION_APPROVED === "true";
const canaryEvidenceKey = process.env.DATA_CANARY_EVIDENCE_HMAC_KEY;
const reportDirectory = arg("--report-dir") ?? `tmp/data-reports/${environment}`;
const requestedRange = { from: arg('--migration-from') ?? undefined, to: arg('--migration-to') ?? undefined };
let migrationRange = migrationRangeForReport(requestedRange);
let stage = 'configuration';
try {
  validateCanaryTarget({ argv: process.argv.slice(2), environment, binding: arg('--binding'), databaseName, databaseId });
  validateCanaryDestinations({ environment, deploymentUrl, customDomain });
  migrationRange = normalizeMigrationRange(requestedRange);
  if (!ownerId || !cookie || !templateId || !runId || !mutationApproved || !deploymentUrl || !customDomain || (canaryEvidenceKey ?? "").length < 32) throw new Error("Protected canary identity, designated records, mutation approval, evidence key, cookie, deployment URL, and custom domain are required.");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const runWrangler = (args) => {
    stage = args[1] === 'info' ? 'identity' : 'd1-query';
    let output;
    try {
      output = execFileSync(pnpm, ["exec", "wrangler", ...args], { encoding: "utf8", env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      // Save only the safe stage/code now: production performs an additional
      // identity read after a failed query, which changes the current stage.
      throw wrapCanarySubprocessFailure(stage, error);
    }
    if (args[1] === 'info') validateCanaryObservation(output, { environment, databaseName, databaseId });
    return output;
  };
  const quotedOwner = ownerId.replaceAll("'", "''");
  const quotedTemplate = templateId.replaceAll("'", "''");
  const quotedRun = runId.replaceAll("'", "''");
  const sql = `SELECT 'template' AS kind, id, title, version, NULL AS progress, NULL AS revision FROM templates WHERE id='${quotedTemplate}' AND user_id='${quotedOwner}' AND deleted_at IS NULL UNION ALL SELECT 'run', id, title, NULL, progress, revision FROM checklist_runs WHERE id='${quotedRun}' AND user_id='${quotedOwner}' AND deleted_at IS NULL;`;
  let identityChecks = [];
  let dbOutput;
  if (environment === "production") {
    const bound = runProductionIdentityBoundCommand({ environment, database: { databaseName, databaseId }, operation: "postdeploy-canary-query", commandArgs: ["d1", "execute", databaseName, "--remote", "--json", "--command", sql], runWrangler });
    dbOutput = bound.output;
    identityChecks = [bound.observedIdentity];
  } else {
    const before = extractD1Identity(runWrangler(["d1", "info", databaseName, "--json"]));
    if (before.databaseId !== databaseId || before.databaseName !== databaseName) throw new Error("Postdeploy D1 identity mismatch.");
    dbOutput = runWrangler(["d1", "execute", databaseName, "--remote", "--json", "--command", sql]);
    const after = extractD1Identity(runWrangler(["d1", "info", databaseName, "--json"]));
    if (after.databaseId !== databaseId || after.databaseName !== databaseName) throw new Error("Postdeploy D1 identity changed during canary query.");
    identityChecks = [{ before, after }];
  }
  stage = 'database-result';
  const dbRows = rowsFromD1(dbOutput, { templateId, runId });
  stage = 'api-read';
  const [templates, runs, deploymentHealth, customHealth] = await Promise.all([
    fetchJson(new URL("/api/templates", deploymentUrl), cookie),
    fetchJson(new URL("/api/checklists", deploymentUrl), cookie),
    fetch(new URL("/api/health", deploymentUrl), { redirect: "error" }),
    fetch(new URL("/api/health", customDomain), { redirect: "error" }),
  ]);
  stage = 'canary-records';
  const originalTemplate = Array.isArray(templates.rows) ? templates.rows.find((row) => String(row.id) === templateId && row.user_id === ownerId) : null;
  const originalRun = Array.isArray(runs.rows) ? runs.rows.find((row) => String(row.id) === runId && row.user_id === ownerId) : null;
  if (!originalTemplate || !originalRun) throw new Error("Designated canary rows are not visible to the authenticated canary owner.");
  const prerequisites = {
    databaseTemplateIds: dbRows.filter((row) => row.kind === "template").map((row) => row.id),
    databaseRunIds: dbRows.filter((row) => row.kind === "run").map((row) => row.id),
    templateStatus: templates.status, templateRows: templates.rows,
    runStatus: runs.status, runRows: runs.rows, ownerId,
    deploymentHealthStatus: deploymentHealth.status, customDomainHealthStatus: customHealth.status,
    designatedTemplateId: templateId, designatedRunId: runId,
    controlledCanaryMutationApproved: mutationApproved,
  };
  const preflight = evaluateDeploymentSmoke(prerequisites);
  stage = 'canary-mutation';
  const mutation = preflight.evidenceChecks.every(check => check.verdict === 'pass')
    ? await exerciseControlledCanaryMutation({ template: originalTemplate, run: originalRun, request: (apiPath, init) => fetchJson(new URL(apiPath, deploymentUrl), cookie, init) })
    : null;
  const canaryEvidenceDigest = createHmac("sha256", canaryEvidenceKey).update(JSON.stringify(mutation)).digest("hex");
  stage = 'reporting';
  const result = evaluateDeploymentSmoke({ ...prerequisites, canaryMutation: mutation, canaryEvidenceDigest });
  const report = { ...result, commit: process.env.GITHUB_SHA ?? "unknown", target: { environment, binding: "DB", databaseName, databaseId }, migrationRange, deploymentUrl, customDomain, identityChecks };
  const summary = [`${report.verdict.toUpperCase()} ${environment} authenticated account-owned template/run visibility, controlled canary writability/restoration, and custom-domain smoke.`, ...[...report.checks, ...(report.evidenceChecks ?? [])].map((check) => `${check.verdict.toUpperCase()} ${check.name}`), `Commit: ${report.commit}`, `Database: ${environment} DB ${databaseName} (${databaseId})`, `Migration range: ${migrationRange.from ?? "none"} → ${migrationRange.to ?? "none"}`].join("\n");
  writeDataCheckReports({ name: `${environment}-postdeploy-smoke`, report, summary, reportDirectory });
  console.log(summary);
  if (report.verdict !== "pass") process.exitCode = 1;
} catch (error) {
  const failure = safeCanaryFailure(stage, error);
  const context = failureContext();
  const report = { check: "authenticated-account-owned-postdeploy-smoke", verdict: "fail", commit: context.commit, target: context.target, targetSource: 'validated-local-configuration', migrationRange: context.migrationRange, failedStage: failure.stage, errorCode: failure.code, error: failure.message, checks: [{ name: failure.check, verdict: 'fail' }], ...(failure.exitStatus !== undefined ? { exitStatus: failure.exitStatus } : {}) };
  const summary = `BLOCKED ${report.target.environment} postdeploy smoke at ${report.failedStage}: ${report.errorCode}. ${report.error}\nCommit: ${report.commit}\nDatabase (locally validated configuration; not observed identity): ${report.target.binding} ${report.target.databaseName} (${report.target.databaseId})\nMigration range: ${report.migrationRange.from ?? "none"} → ${report.migrationRange.to ?? "none"}`;
  try { writeDataCheckReports({ name: context.name, report, summary, reportDirectory: context.reportDirectory }); }
  catch { console.error('Canary failure report could not be persisted.'); }
  console.error(summary);
  process.exitCode = 1;
}
