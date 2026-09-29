#!/usr/bin/env node
// Prepare a staging -> main promotion branch that merges without conflicts.
//
// Both branches require linear history, so promotions are squash merges and main never
// shares history with staging. Git then diffs a promotion against a months-old merge base
// and reports conflicts in files that already match. This script pushes a branch whose
// files are exactly staging's, with main recorded as a second parent, so GitHub merges it
// against main's tip. No files change, nothing is force-pushed, and no sync-back PR is
// needed afterwards.
//
// Usage: pnpm run promote:prepare [-- --dry-run]
import { execFileSync } from "node:child_process";

const dryRun = process.argv.includes("--dry-run");

function git(...args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

git("fetch", "--quiet", "origin", "main", "staging");
const main = git("rev-parse", "origin/main");
const staging = git("rev-parse", "origin/staging");
const stagingTree = git("rev-parse", "origin/staging^{tree}");

if (git("rev-parse", "origin/main^{tree}") === stagingTree) {
  console.log("main already has staging's files; there is nothing to promote.");
  process.exit(0);
}

// -s ours semantics would silently drop anything that exists only on main (a hotfix).
// Refuse unless main's files are exactly some earlier staging state.
const mainTree = git("rev-parse", "origin/main^{tree}");
const stagingTrees = new Set(git("log", "--format=%T", "origin/staging").split("\n"));
if (!stagingTrees.has(mainTree)) {
  console.error(
    "main has changes that are not in staging (for example a hotfix). Bring them into\n" +
      "staging through a normal PR first, then run this again.",
  );
  process.exit(1);
}

const branch = `promote/staging-${new Date().toISOString().slice(0, 10)}`;
const commit = git(
  "commit-tree",
  stagingTree,
  "-p",
  staging,
  "-p",
  main,
  "-m",
  `Record main as merged into staging for promotion\n\nFiles are identical to staging ${staging.slice(0, 7)}.`,
);

if (dryRun) {
  console.log(`Dry run: would push ${commit.slice(0, 7)} (staging ${staging.slice(0, 7)} + main ${main.slice(0, 7)}) to ${branch}.`);
  process.exit(0);
}

git("push", "--quiet", "origin", `${commit}:refs/heads/${branch}`);
console.log(`Pushed ${branch}: staging ${staging.slice(0, 7)} with main ${main.slice(0, 7)} recorded as merged.`);
console.log(`Open the promotion PR, then squash-merge it:\n  gh pr create --base main --head ${branch}`);
