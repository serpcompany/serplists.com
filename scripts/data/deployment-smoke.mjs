#!/usr/bin/env node
import { normalizeMigrationRange, migrationRangeForReport } from "./migration-range-lib.mjs";
import { createHmac } from "node:crypto";
import { execFileSync } from "node:child_process";
import { evaluateDeploymentSmoke, exerciseControlledCanaryMutation } from "./deployment-smoke-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { runProductionIdentityBoundCommand } from "./production-identity-bound-command-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
import { safeCanaryFailure, wrapCanarySubprocessFailure } from "./canary-diagnostics.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
function rowsFromD1(output) {
  const parsed = JSON.parse(output);
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry.results ?? []);
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
  migrationRange = normalizeMigrationRange(requestedRange);
  if (!ownerId || !cookie || !templateId || !runId || !mutationApproved || !deploymentUrl || !customDomain || (canaryEvidenceKey ?? "").length < 32) throw new Error("Protected canary identity, designated records, mutation approval, evidence key, cookie, deployment URL, and custom domain are required.");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const runWrangler = (args) => {
    stage = args[1] === 'info' ? 'identity' : 'd1-query';
    try {
      return execFileSync(pnpm, ["exec", "wrangler", ...args], { encoding: "utf8", env: childEnv, stdio: ['ignore', 'pipe', 'pipe'] });
    } catch (error) {
      // Save only the safe stage/code now: production performs an additional
      // identity read after a failed query, which changes the current stage.
      throw wrapCanarySubprocessFailure(stage, error);
    }
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
  const dbRows = rowsFromD1(dbOutput);
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
  const report = { check: "authenticated-account-owned-postdeploy-smoke", verdict: "fail", commit: process.env.GITHUB_SHA ?? "unknown", target: { environment, binding: "DB", databaseName, databaseId }, migrationRange, failedStage: failure.stage, errorCode: failure.code, error: failure.message, checks: [{ name: failure.check, verdict: 'fail' }], ...(failure.exitStatus !== undefined ? { exitStatus: failure.exitStatus } : {}) };
  const summary = `BLOCKED ${environment} postdeploy smoke at ${report.failedStage}: ${report.errorCode}. ${report.error}\nCommit: ${report.commit}\nDatabase: DB ${databaseName} (${databaseId})\nMigration range: ${migrationRange.from ?? "none"} → ${migrationRange.to ?? "none"}`;
  try { writeDataCheckReports({ name: `${environment}-postdeploy-smoke`, report, summary, reportDirectory }); }
  catch { console.error('Canary failure report could not be persisted.'); }
  console.error(summary);
  process.exitCode = 1;
}
