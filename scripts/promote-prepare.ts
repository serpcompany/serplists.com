import { execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { errorMessage } from "./lib/error-message";
import { type Git, PROMOTION_BODY_FILE, promotionBody, SQUASH_ONLY, stagingSubjectsSinceTheLastPromotion } from "./promote-prepare-lib";

export {
  type Git,
  issuesClosedBy,
  PROMOTION_BODY_FILE,
  promotionBody,
  pullRequestOf,
  stagingSubjectsSinceTheLastPromotion,
} from "./promote-prepare-lib";

function pullRequestBody(pullRequest: number): string {
  try {
    return execFileSync("gh", ["api", `repos/{owner}/{repo}/pulls/${pullRequest}`, "--jq", '.body // ""'], {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (error) {
    throw new Error(`gh could not read pull request #${pullRequest}, whose Closes lines the promotion carries to main. ` +
      `Sign in with gh auth login, then run this again.\n${errorMessage(error)}`);
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
