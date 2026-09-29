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
  return execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
}

function tryGit(...args) {
  try {
    return git(...args);
  } catch {
    return null;
  }
}

git("fetch", "--quiet", "origin", "main", "staging");
const main = git("rev-parse", "origin/main");
const staging = git("rev-parse", "origin/staging");
const mainTree = git("rev-parse", "origin/main^{tree}");
const stagingTree = git("rev-parse", "origin/staging^{tree}");

if (mainTree === stagingTree) {
  console.log("main already has staging's files; there is nothing to promote.");
  process.exit(0);
}

// Keeping staging's files drops anything that exists only on main (a hotfix), so check
// that main has nothing staging lacks. The last promotion is the newest main commit whose
// files match some staging commit. Anything main changed after it must already be in
// staging: merging those changes into staging has to leave staging's files unchanged.
const stagingTrees = new Set(git("log", "--format=%T", "origin/staging").split("\n"));
const lastPromotion = git("log", "--first-parent", "--format=%H %T", "origin/main")
  .split("\n")
  .map((line) => line.split(" "))
  .find(([, tree]) => stagingTrees.has(tree))?.[0];
const mainOnlyChangesAreInStaging =
  lastPromotion !== undefined &&
  (git("rev-parse", `${lastPromotion}^{tree}`) === mainTree ||
    tryGit("merge-tree", "--write-tree", `--merge-base=${lastPromotion}`, "origin/staging", "origin/main") === stagingTree);
if (!mainOnlyChangesAreInStaging) {
  const changed = lastPromotion ? git("diff", "--name-only", lastPromotion, "origin/main") : "(no earlier promotion found)";
  console.error(
    "main has changes that are not in staging (for example a hotfix). Bring them into\n" +
      `staging through a normal PR first, then run this again. Files changed on main:\n${changed}`,
  );
  process.exit(1);
}

const branch = `promote/staging-${new Date().toISOString().slice(0, 10)}-${staging.slice(0, 7)}`;
const squashOnly =
  "Squash-merge this PR. A rebase merge would replay staging's history onto main, and\n" +
  "merge commits are not allowed.";

if (tryGit("ls-remote", "--exit-code", "--heads", "origin", branch) !== null) {
  console.log(`${branch} already exists for staging ${staging.slice(0, 7)}.`);
  console.log(`Open the promotion PR if it isn't open yet:\n  gh pr create --base main --head ${branch}\n${squashOnly}`);
  process.exit(0);
}

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
console.log(`Open the promotion PR:\n  gh pr create --base main --head ${branch}\n${squashOnly}`);
