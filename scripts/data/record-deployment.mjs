#!/usr/bin/env node
import { existsSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

const environment = arg("--environment") ?? "unknown";
const commit = arg("--commit") ?? "unknown";
const tree = arg("--tree") ?? "unknown";
const databaseName = arg("--database-name") ?? "unknown";
const databaseId = arg("--database-id") ?? "unknown";
const outcome = arg("--outcome") ?? "unknown";
const rawOutput = arg("--raw-output");
const reportDirectory = arg("--report-dir") ?? `tmp/data-reports/${environment}-deploy`;
const verdict = outcome === "success" && rawOutput && existsSync(rawOutput) ? "pass" : "fail";
const report = {
  check: "pages-deployment",
  verdict,
  commit,
  tree,
  target: { environment, databaseName, databaseId },
  outcome,
  rawOutput: rawOutput ? path.basename(rawOutput) : null,
};
const summary = `${verdict.toUpperCase()} ${environment} Pages deployment for commit ${commit}, tree ${tree}, database ${databaseName} (${databaseId}); outcome=${outcome}.`;
writeDataCheckReports({ name: `${environment}-deploy`, report, summary, reportDirectory });
if (verdict !== "pass") process.exitCode = 1;
