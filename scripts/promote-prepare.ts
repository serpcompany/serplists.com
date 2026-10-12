import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

export type Git = (...args: string[]) => string;

export const PROMOTION_BODY_FILE = "tmp/promotion-body.md";
const CLOSES_LINE = /^closes #(\d+)$/i;
const SQUASHED_PULL_REQUEST = /\(#(\d+)\)$/;
const MERGED_PULL_REQUEST = /^Merge pull request #(\d+) /;
const SQUASH_ONLY =
  "Squash-merge this PR. A rebase merge would replay staging's history onto main, and\n" +
  "merge commits are not allowed.";

const numbers = (values: readonly number[]) => [...new Set(values)].sort((first, second) => first - second);

export function pullRequestOf(subject: string): number | null {
  const found = SQUASHED_PULL_REQUEST.exec(subject.trim()) ?? MERGED_PULL_REQUEST.exec(subject.trim());
  return found?.[1] === undefined ? null : Number(found[1]);
}

export function issuesClosedBy(body: string): number[] {
  return body.split(/\r?\n/).flatMap((line) => {
    const closes = CLOSES_LINE.exec(line.trim());
    return closes?.[1] === undefined ? [] : [Number(closes[1])];
  });
}

export function stagingSubjectsSinceTheLastPromotion(git: Git): string[] {
  const treesMainHasHad = new Set(git("log", "--first-parent", "--format=%T", "origin/main").split("\n"));
  const promoted = git("log", "--first-parent", "--format=%H %T", "origin/staging")
    .split("\n")
    .map((line) => line.split(" "))
    .find(([, tree]) => tree !== undefined && treesMainHasHad.has(tree))?.[0];
  const subjects = git("log", "--first-parent", "--format=%s", promoted === undefined ? "origin/staging" : `${promoted}..origin/staging`);
  return subjects === "" ? [] : subjects.split("\n");
}

export function promotionBody(staging: string, subjects: readonly string[], bodyOf: (pullRequest: number) => string): string {
  const pullRequests = numbers(subjects.flatMap((subject) => pullRequestOf(subject) ?? []));
  const issues = numbers(pullRequests.flatMap((pullRequest) => issuesClosedBy(bodyOf(pullRequest))));
  const closes = issues.length > 0 ? issues.map((issue) => `Closes #${issue}`) : ["No issue: none of the promoted pull requests closes one."];
  const promoted = pullRequests.length > 0 ? `, with ${pullRequests.map((pullRequest) => `#${pullRequest}`).join(", ")}` : "";
  return [...closes, "", `Promotes staging ${staging.slice(0, 7)} to main${promoted}.`, "", SQUASH_ONLY, ""].join("\n");
}

function pullRequestBody(pullRequest: number): string {
  try {
    return execFileSync("gh", ["api", `repos/{owner}/{repo}/pulls/${pullRequest}`, "--jq", '.body // ""'], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    throw new Error(`gh could not read pull request #${pullRequest}, whose Closes lines the promotion carries to main. ` +
      `Sign in with gh auth login, then run this again.\n${reason}`);
  }
}

function main() {
  const dryRun = process.argv.includes("--dry-run");
  const git: Git = (...args) => execFileSync("git", args, { encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  const tryGit = (...args: string[]): string | null => {
    try {
      return git(...args);
    } catch {
      return null;
    }
  };

  git("fetch", "--quiet", "origin", "main", "staging");
  const mainCommit = git("rev-parse", "origin/main");
  const staging = git("rev-parse", "origin/staging");
  const mainTree = git("rev-parse", "origin/main^{tree}");
  const stagingTree = git("rev-parse", "origin/staging^{tree}");

  if (mainTree === stagingTree) {
    console.log("main already has staging's files; there is nothing to promote.");
    return;
  }

  const treesStagingHasHad = new Set(git("log", "--format=%T", "origin/staging").split("\n"));
  const lastPromotion = git("log", "--first-parent", "--format=%H %T", "origin/main")
    .split("\n")
    .map((line) => line.split(" "))
    .find(([, tree]) => tree !== undefined && treesStagingHasHad.has(tree))?.[0];
  const mainUnchangedSinceTheLastPromotion = () => git("rev-parse", `${lastPromotion}^{tree}`) === mainTree;
  const mergingMainsLaterChangesLeavesStagingUnchanged = () =>
    tryGit("merge-tree", "--write-tree", `--merge-base=${lastPromotion}`, "origin/staging", "origin/main") === stagingTree;
  if (lastPromotion === undefined || !(mainUnchangedSinceTheLastPromotion() || mergingMainsLaterChangesLeavesStagingUnchanged())) {
    const changed = lastPromotion ? git("diff", "--name-only", lastPromotion, "origin/main") : "(no earlier promotion found)";
    console.error(
      "main has changes that are not in staging (for example a hotfix). Bring them into\n" +
        `staging through a normal PR first, then run this again. Files changed on main:\n${changed}`,
    );
    process.exitCode = 1;
    return;
  }

  const body = promotionBody(staging, stagingSubjectsSinceTheLastPromotion(git), pullRequestBody);
  mkdirSync(path.dirname(PROMOTION_BODY_FILE), { recursive: true });
  writeFileSync(PROMOTION_BODY_FILE, body);
  console.log(`The promotion PR's body, written to ${PROMOTION_BODY_FILE}:\n\n${body}`);

  const branch = `promote/staging-${new Date().toISOString().slice(0, 10)}-${staging.slice(0, 7)}`;
  const openIt =
    `Open the promotion PR:\n  gh pr create --base main --head ${branch} ` +
    `--title "chore: promote staging ${staging.slice(0, 7)} to main" --body-file ${PROMOTION_BODY_FILE}\n${SQUASH_ONLY}`;

  if (tryGit("ls-remote", "--exit-code", "--heads", "origin", branch) !== null) {
    console.log(`${branch} already exists for staging ${staging.slice(0, 7)}. ${openIt}`);
    return;
  }

  const commit = git(
    "commit-tree",
    stagingTree,
    "-p",
    staging,
    "-p",
    mainCommit,
    "-m",
    `Record main as merged into staging for promotion\n\nFiles are identical to staging ${staging.slice(0, 7)}.`,
  );

  if (dryRun) {
    console.log(`Dry run: would push ${commit.slice(0, 7)} (staging ${staging.slice(0, 7)} + main ${mainCommit.slice(0, 7)}) to ${branch}.`);
    return;
  }

  git("push", "--quiet", "origin", `${commit}:refs/heads/${branch}`);
  console.log(`Pushed ${branch}: staging ${staging.slice(0, 7)} with main ${mainCommit.slice(0, 7)} recorded as merged.\n${openIt}`);
}

if (process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url) {
  main();
}
