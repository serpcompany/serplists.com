#!/usr/bin/env node
import { readFileSync, writeFileSync } from "node:fs";
import { validateChangeProvenance } from "./production-executor-lib.mjs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

try {
  const provenance = validateChangeProvenance({
    pulls: JSON.parse(readFileSync(arg("--pulls"), "utf8")),
    commits: JSON.parse(readFileSync(arg("--commits"), "utf8")),
    commitAuthors: JSON.parse(readFileSync(arg("--commit-authors"), "utf8")),
    mergeCommit: JSON.parse(readFileSync(arg("--merge-commit"), "utf8")),
    mergeAuthors: JSON.parse(readFileSync(arg("--merge-authors"), "utf8")),
    expectedCommit: arg("--commit"),
  });
  writeFileSync(arg("--output"), `${JSON.stringify(provenance, null, 2)}\n`, { mode: 0o600 });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
