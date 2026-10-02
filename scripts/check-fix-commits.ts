import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";

import { type CommitChange, FIX_WITHOUT_A_TEST_MESSAGE, fixCommitsWithoutATest, isFixSubject, isTestFile } from "./lib/fix-commits";

const USAGE =
  "Usage: node --import tsx scripts/check-fix-commits.ts --range <base>..<head>\n" +
  "       node --import tsx scripts/check-fix-commits.ts --commit-msg <message file>";

const { values } = parseArgs({ options: { range: { type: "string" }, "commit-msg": { type: "string" } } });

const git = (args: readonly string[]): string => execFileSync("git", args, { encoding: "utf8" });
const lines = (text: string): string[] => text.split("\n").map((line) => line.trim()).filter(Boolean);

function commitsIn(range: string): CommitChange[] {
  return lines(git(["log", "--no-merges", "--format=%H%x09%s", range])).map((line) => {
    const [sha = "", ...subject] = line.split("\t");
    return { sha, subject: subject.join("\t"), files: lines(git(["diff-tree", "--root", "--no-commit-id", "--name-only", "-r", sha])) };
  });
}

function checkRange(range: string): void {
  const missing = fixCommitsWithoutATest(commitsIn(range));
  if (missing.length === 0) {
    console.log(`check-fix-commits: every fix: commit in ${range} changes a test.`);
    return;
  }
  for (const commit of missing) console.log(`${commit.sha.slice(0, 8)}  ${commit.subject}`);
  console.log(FIX_WITHOUT_A_TEST_MESSAGE);
  process.exitCode = 1;
}

function checkCommitMessage(messageFile: string): void {
  const subject = readFileSync(messageFile, "utf8").split("\n")[0] ?? "";
  if (!isFixSubject(subject)) return;
  if (lines(git(["diff", "--cached", "--name-only"])).some(isTestFile)) return;
  console.log(FIX_WITHOUT_A_TEST_MESSAGE);
  process.exitCode = 1;
}

if (values.range) checkRange(values.range);
else if (values["commit-msg"]) checkCommitMessage(values["commit-msg"]);
else {
  console.error(USAGE);
  process.exitCode = 2;
}
