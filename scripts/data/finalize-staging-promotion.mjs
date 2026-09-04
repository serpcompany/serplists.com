#!/usr/bin/env node
import { readFileSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
function read(name) { return JSON.parse(readFileSync(arg(name), "utf8")); }

const commit = arg("--commit") ?? "unknown";
const tree = arg("--tree") ?? "unknown";
const databaseName = arg("--database-name") ?? "unknown";
const databaseId = arg("--database-id") ?? "unknown";
const output = arg("--output") ?? "tmp/data-reports/staging-promotion/staging-promotion.json";
let report;
try {
  const data = read("--data");
  const range = read("--range");
  const schema = read("--schema");
  const invariants = read("--invariants");
  const deploy = read("--deploy");
  const smoke = read("--smoke");
  const exactCommit = [data.commit, range.commit, schema.commit, deploy.commit, smoke.commit].every((value) => value === commit);
  const exactTarget = range.target?.environment === "staging" && range.target?.databaseName === databaseName &&
    range.target?.databaseId === databaseId && schema.target?.environment === "staging" && schema.target?.database === databaseName &&
    schema.target?.databaseId === databaseId && deploy.target?.environment === "staging" &&
    deploy.target?.databaseName === databaseName && deploy.target?.databaseId === databaseId &&
    smoke.target?.environment === "staging" && smoke.target?.databaseName === databaseName &&
    smoke.target?.databaseId === databaseId;
  if (!exactCommit || !exactTarget || deploy.tree !== tree) throw new Error("Staging evidence identity does not match the exact commit, tree, environment, and database.");
  if (data.verdict !== "pass" || data.teardown?.verdict !== "pass" || range.verdict !== "pass" || schema.verdict !== "pass" ||
      schema.ledger?.verdict !== "pass" || invariants.verdict !== "pass" || deploy.verdict !== "pass" || smoke.verdict !== "pass" ||
      !Array.isArray(smoke.failures) || smoke.failures.length) {
    throw new Error("Staging data, migration ledger, invariants, deploy, authenticated/custom-domain smoke, and teardown must all pass.");
  }
  report = {
    check: "staging-promotion",
    verdict: "pass",
    commit,
    tree,
    target: { environment: "staging", databaseName, databaseId },
    baseCommit: range.baseCommit,
    migrationRange: range.migrationRange,
    pendingMigrations: range.pendingMigrations,
    data: { verdict: data.verdict, teardown: data.teardown },
    schema: { verdict: schema.verdict, ledger: schema.ledger },
    invariants: { verdict: invariants.verdict },
    deploy: { verdict: deploy.verdict },
    smoke: { verdict: smoke.verdict, failures: smoke.failures },
    teardown: data.teardown,
  };
} catch (error) {
  report = {
    check: "staging-promotion",
    verdict: "fail",
    commit,
    tree,
    target: { environment: "staging", databaseName, databaseId },
    migrationRange: { from: null, to: null },
    failedStage: "finalize-staging-promotion",
    error: error instanceof Error ? error.message : String(error),
  };
}
const summary = `${report.verdict.toUpperCase()} staging promotion for commit ${commit}, tree ${tree}, database ${databaseName} (${databaseId})${report.error ? `: ${report.error}` : "."}`;
writeDataCheckReports({ name: "staging-promotion", report, summary, reportDirectory: path.dirname(output) });
if (report.verdict !== "pass") process.exitCode = 1;
