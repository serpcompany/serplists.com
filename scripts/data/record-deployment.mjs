#!/usr/bin/env node
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateReportIdentity, reportIdentitySummary } from './report-identity-lib.mjs';

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

const environment = arg("--environment") ?? "unknown";
const commit = arg("--commit") ?? "unknown";
const tree = arg("--tree") ?? "unknown";
const databaseName = arg("--database-name") ?? "unknown";
const databaseId = arg("--database-id") ?? "unknown";
const outcome = arg("--outcome") ?? "unknown";
const rawOutput = arg("--raw-output");
const reportDirectory = arg("--report-dir") ?? `tmp/data-reports/${environment}-deploy`;
let identity, error;
try {
  let migrationRange = { from: arg('--migration-from') ?? undefined, to: arg('--migration-to') ?? undefined };
  let reviewed;
  if (arg('--reviewed-evidence')) {
    const evidence = JSON.parse(readFileSync(arg('--reviewed-evidence'), 'utf8'));
    reviewed = { commit: evidence.commit, target: evidence.target ?? { environment: 'production', binding: 'DB', databaseName: evidence.database?.databaseName, databaseId: evidence.database?.databaseId }, migrationRange: evidence.migrationRange };
    if (evidence.target && evidence.verdict !== 'pass') throw new Error('Reviewed evidence did not pass.');
    if (migrationRange.from === undefined && migrationRange.to === undefined) migrationRange = evidence.migrationRange;
  }
  identity = validateReportIdentity({ commit, target: { environment, binding: arg('--binding'), databaseName, databaseId }, migrationRange }, reviewed);
  if (!/^[a-f0-9]{40}$/.test(tree)) throw new Error('Deployment tree is missing or invalid.');
} catch { error = 'Deployment identity or reviewed migration range is missing, invalid, or mismatched.'; }
const verdict = !error && outcome === "success" && rawOutput && existsSync(rawOutput) ? "pass" : "fail";
const report = {
  check: "pages-deployment",
  verdict,
  commit,
  tree,
  target: { environment, binding: arg('--binding'), databaseName, databaseId },
  migrationRange: { from: 'invalid', to: 'invalid' },
  ...identity,
  ...(error ? { error } : {}),
  outcome,
  rawOutput: rawOutput ? path.basename(rawOutput) : null,
};
const summary = `${verdict.toUpperCase()} Pages deployment; ${reportIdentitySummary(report)}; tree ${tree}; outcome=${outcome}.${error ? ` ${error}` : ''}`;
writeDataCheckReports({ name: `${environment}-deploy`, report, summary, reportDirectory });
if (verdict !== "pass") process.exitCode = 1;
