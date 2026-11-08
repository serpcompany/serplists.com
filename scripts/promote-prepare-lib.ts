export type Git = (...args: string[]) => string;

export const PROMOTION_BODY_FILE = "tmp/promotion-body.md";
const CLOSES_LINE = /^closes #(\d+)$/i;
const SQUASHED_PULL_REQUEST = /\(#(\d+)\)$/;
const MERGED_PULL_REQUEST = /^Merge pull request #(\d+) /;
export const SQUASH_ONLY =
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
