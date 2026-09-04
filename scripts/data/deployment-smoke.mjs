#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { evaluateDeploymentSmoke } from "./deployment-smoke-lib.mjs";
import { extractD1Identity } from "./wrangler-identity-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
function rowsFromD1(output) {
  const parsed = JSON.parse(output);
  return (Array.isArray(parsed) ? parsed : [parsed]).flatMap((entry) => entry.results ?? []);
}
async function fetchJson(url, cookie) {
  const response = await fetch(url, { headers: { cookie, accept: "application/json" }, redirect: "error" });
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
const reportDirectory = arg("--report-dir") ?? `tmp/data-reports/${environment}`;
try {
  if (!ownerId || !cookie || !deploymentUrl || !customDomain) throw new Error("Protected canary identity, cookie, deployment URL, and custom domain are required.");
  const pnpm = process.platform === "win32" ? "pnpm.cmd" : "pnpm";
  const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
  const identityOutput = execFileSync(pnpm, ["exec", "wrangler", "d1", "info", databaseName, "--json"], { encoding: "utf8", env: childEnv });
  const identity = extractD1Identity(identityOutput);
  if (identity.databaseId !== databaseId || identity.databaseName !== databaseName) throw new Error("Postdeploy D1 identity mismatch.");
  const sql = `SELECT 'template' AS kind, id FROM templates WHERE user_id='${ownerId.replaceAll("'", "''")}' AND deleted_at IS NULL UNION ALL SELECT 'run', id FROM checklist_runs WHERE user_id='${ownerId.replaceAll("'", "''")}' AND deleted_at IS NULL;`;
  const dbOutput = execFileSync(pnpm, ["exec", "wrangler", "d1", "execute", databaseName, "--remote", "--json", "--command", sql], { encoding: "utf8", env: childEnv });
  const dbRows = rowsFromD1(dbOutput);
  const [templates, runs, deploymentHealth, customHealth] = await Promise.all([
    fetchJson(new URL("/api/templates", deploymentUrl), cookie),
    fetchJson(new URL("/api/checklists", deploymentUrl), cookie),
    fetch(new URL("/api/health", deploymentUrl), { redirect: "error" }),
    fetch(new URL("/api/health", customDomain), { redirect: "error" }),
  ]);
  const result = evaluateDeploymentSmoke({
    databaseTemplateIds: dbRows.filter((row) => row.kind === "template").map((row) => row.id),
    databaseRunIds: dbRows.filter((row) => row.kind === "run").map((row) => row.id),
    templateStatus: templates.status,
    templateRows: templates.rows,
    runStatus: runs.status,
    runRows: runs.rows,
    ownerId,
    deploymentHealthStatus: deploymentHealth.status,
    customDomainHealthStatus: customHealth.status,
  });
  const report = { ...result, commit: process.env.GITHUB_SHA ?? "unknown", target: { environment, databaseName, databaseId }, deploymentUrl, customDomain };
  const summary = `${report.verdict.toUpperCase()} ${environment} authenticated account-owned template/run visibility and custom-domain smoke.`;
  writeDataCheckReports({ name: `${environment}-postdeploy-smoke`, report, summary, reportDirectory });
  console.log(summary);
  if (report.verdict !== "pass") process.exitCode = 1;
} catch (error) {
  const report = { check: "authenticated-account-owned-postdeploy-smoke", verdict: "fail", commit: process.env.GITHUB_SHA ?? "unknown", target: { environment, databaseName, databaseId }, deploymentUrl, customDomain, error: error instanceof Error ? error.message : String(error) };
  const summary = `BLOCKED ${environment} postdeploy smoke: ${report.error}`;
  writeDataCheckReports({ name: `${environment}-postdeploy-smoke`, report, summary, reportDirectory });
  console.error(summary);
  process.exitCode = 1;
}
