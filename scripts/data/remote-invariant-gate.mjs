#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { captureRemoteInvariantSnapshot, compareProductionInvariants } from "./invariant-capture-lib.mjs";
import { writeDataCheckReports } from "./reporting.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
const mode = process.argv[2];
const database = arg("--database");
const state = arg("--state");
const reportDirectory = arg("--report-dir") ?? "tmp/data-reports/remote-invariants";
const childEnv = Object.fromEntries(["PATH", "HOME", "CI", "CLOUDFLARE_API_TOKEN", "CLOUDFLARE_ACCOUNT_ID"].filter((key) => process.env[key]).map((key) => [key, process.env[key]]));
function wrangler(args) { return execFileSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", ...args], { encoding: "utf8", env: childEnv }); }
function capture() {
  return captureRemoteInvariantSnapshot({
    database,
    key: process.env.INVARIANT_HMAC_KEY,
    runWrangler: wrangler,
  });
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
    const comparison = compareProductionInvariants({ pre: pre.invariants, post: post.invariants, preHasEvolution: pre.hasEvolution, postHasEvolution: post.hasEvolution, preDomain: pre.domain, postDomain: post.domain });
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
