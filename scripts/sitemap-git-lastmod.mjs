import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function normalizeGitDate(value) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export async function gitLastmod({ repoRoot, sources }) {
  try {
    const { stdout } = await execFileAsync(
      "git",
      ["log", "--no-merges", "-1", "--format=%H%x00%aI", "--", ...sources],
      { cwd: repoRoot },
    );
    const [commit, date] = stdout.trim().split("\0");
    if (!commit || !date) return null;

    // A depth-one checkout marks HEAD as a shallow root, so `git log
    // --no-merges` can misclassify a synthetic PR merge as an ordinary commit.
    // Inspect the raw commit header, whose parent lines remain authoritative.
    const { stdout: rawCommit } = await execFileAsync("git", ["cat-file", "-p", commit], {
      cwd: repoRoot,
    });
    const header = rawCommit.split("\n\n", 1)[0];
    const parentCount = header.split("\n").filter((line) => line.startsWith("parent ")).length;
    if (parentCount > 1) return null;

    return normalizeGitDate(date);
  } catch {
    return null;
  }
}
