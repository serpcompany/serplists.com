export type CommitChange = { sha: string; subject: string; files: readonly string[] };

const FIX_SUBJECT = /^fix(?:\([^)]*\))?!?:/i;
const TEST_FILE = /\.(?:test|spec)\.[cm]?[jt]sx?$/;

export const FIX_WITHOUT_A_TEST_MESSAGE =
  "A fix: commit must add or change the test that fails without the fix, so the bug cannot come back. " +
  "Add that regression test to the same commit. If the commit fixes no behavior, give it another type: " +
  "refactor:, build:, docs:, test: or chore:.";

export const isFixSubject = (subject: string): boolean => FIX_SUBJECT.test(subject.trim());

export function isTestFile(file: string): boolean {
  const posixPath = file.replaceAll("\\", "/");
  return posixPath.startsWith("tests/") || TEST_FILE.test(posixPath);
}

export const fixCommitsWithoutATest = (commits: readonly CommitChange[]): CommitChange[] =>
  commits.filter((commit) => isFixSubject(commit.subject) && !commit.files.some(isTestFile));
