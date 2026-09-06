#!/usr/bin/env node
import { parseExactJson } from "./strict-json-lib.mjs";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { normalizeMigrationRange, migrationRangesEqual } from "./migration-range-lib.mjs";
import { safeCanaryFailure } from './canary-diagnostics.mjs';

export function selectRangeEvidence(directory, range) {
  range = normalizeMigrationRange(range);
  const matches = [];
  function visit(root) {
    for (const entry of readdirSync(root, { withFileTypes: true })) {
      const file = path.join(root, entry.name);
      if (entry.isDirectory()) visit(file);
      else if (entry.name === "data-regression-suite.json") {
        const report = parseExactJson(readFileSync(file, "utf8"));
        if (migrationRangesEqual(report.migrationRange, range)) matches.push({ file, report });
      }
    }
  }
  visit(directory);
  if (matches.length !== 1) throw new Error("Expected exactly one CI report for the reviewed migration range.");
  return matches[0];
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(new URL(import.meta.url).pathname)) {
  try { console.log(selectRangeEvidence(process.argv[2], { from: process.argv[3], to: process.argv[4] }).file); }
  catch (error) {
    const failure = safeCanaryFailure('data-reporting', error);
    console.error(`${failure.stage} ${failure.code}: ${failure.message}`);
    process.exitCode = 1;
  }
}
