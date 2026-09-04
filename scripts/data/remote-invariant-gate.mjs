#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { compareProductionInvariants, parseInvariantOutput, privacySafeOwnershipDigest } from "./production-executor-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const mode = process.argv[2];
const database = arg("--database");
const state = arg("--state");
const reportDirectory = arg("--report-dir") ?? "tmp/data-reports/remote-invariants";
const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
function wrangler(args) { return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { encoding: "utf8", env: childEnv }); }
function capture() {
  const baseline = wrangler(["d1", "execute", database, "--remote", "--json", "--file", "scripts/data/sql/capture-invariants.sql"]);
  const ledger = wrangler(["d1", "execute", database, "--remote", "--json", "--command", "SELECT name FROM d1_migrations WHERE name='0024_safe_template_evolution.sql'"]);
  const hasEvolution = JSON.stringify(ledger).includes("0024_safe_template_evolution.sql");
  let combined = JSON.parse(baseline);
  if (hasEvolution) combined = [...combined, ...JSON.parse(wrangler(["d1", "execute", database, "--remote", "--json", "--file", "scripts/data/sql/capture-invariants-0024.sql"]))];
  const invariants = parseInvariantOutput(JSON.stringify(combined));
  const ownerSql = "SELECT 'template' kind,id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END deleted_state FROM templates UNION ALL SELECT 'run',id,user_id,CASE WHEN deleted_at IS NULL THEN 'active' ELSE 'deleted' END FROM checklist_runs";
  const raw = JSON.parse(wrangler(["d1", "execute", database, "--remote", "--json", "--command", ownerSql]));
  invariants.ownershipDigest = privacySafeOwnershipDigest({ rows: raw.flatMap((entry) => entry.results ?? []), key: process.env.INVARIANT_HMAC_KEY });
  return { invariants, hasEvolution };
}
try {
  if (!database || !state || !["capture", "compare"].includes(mode)) throw new Error("Remote invariant gate arguments are incomplete.");
  if (mode === "capture") {
    mkdirSync(path.dirname(state), { recursive: true });
    writeFileSync(state, JSON.stringify(capture(), null, 2) + "\n", { mode: 0o600 });
    console.log("PASS remote pre-invariants captured.");
  } else {
    const pre = JSON.parse(readFileSync(state, "utf8"));
    const post = capture();
    const comparison = compareProductionInvariants({ pre: pre.invariants, post: post.invariants, preHasEvolution: pre.hasEvolution, postHasEvolution: post.hasEvolution });
    const summary = `${comparison.verdict.toUpperCase()} remote pre/post invariant and ownership-digest comparison.`;
    writeDataCheckReports({ name: "remote-invariant-comparison", report: { ...comparison, check: "remote-invariant-comparison" }, summary, reportDirectory });
    console.log(summary);
    if (comparison.verdict !== "pass") process.exitCode = 1;
  }
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  writeDataCheckReports({ name: "remote-invariant-comparison", report: { check: "remote-invariant-comparison", verdict: "fail", error: message }, summary: `BLOCKED remote invariants: ${message}`, reportDirectory });
  console.error(message); process.exitCode = 1;
}
