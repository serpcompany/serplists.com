import { execFileSync } from "node:child_process";
import { mkdtempSync, realpathSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { captureRepositoryGitState, runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";

function createRepository(root, name) {
  const directory = path.join(root, name);
  execFileSync("git", ["init", "-q", directory], { env: sanitizedGitEnvironment() });
  writeFileSync(path.join(directory, "tracked.txt"), name);
  runRepositoryGit({ repoRoot: directory, args: ["add", "tracked.txt"] });
  runRepositoryGit({ repoRoot: directory, args: ["-c", "core.hooksPath=/dev/null", "-c", "user.name=Test", "-c", "user.email=test@example.invalid", "commit", "-qm", `create ${name}`] });
  return directory;
}

describe("sanitized repository Git subprocesses", () => {
  it("ignores poisoned repository, worktree, and index variables for HEAD and cleanliness", () => {
    const root = mkdtempSync(path.join(tmpdir(), "sanitized-git-env-"));
    try {
      const intended = createRepository(root, "intended");
      const poison = createRepository(root, "poison");
      writeFileSync(path.join(intended, "tracked.txt"), "intended dirty change");
      const env = { ...process.env, GIT_DIR: path.join(poison, ".git"), GIT_WORK_TREE: poison, GIT_INDEX_FILE: path.join(poison, ".git/index") };
      const intendedHead = runRepositoryGit({ repoRoot: intended, args: ["rev-parse", "HEAD"] }).trim();
      const poisonHead = runRepositoryGit({ repoRoot: poison, args: ["rev-parse", "HEAD"] }).trim();
      expect(intendedHead).not.toBe(poisonHead);
      expect(runRepositoryGit({ repoRoot: intended, args: ["rev-parse", "HEAD"], env }).trim()).toBe(intendedHead);
      expect(realpathSync(runRepositoryGit({ repoRoot: intended, args: ["rev-parse", "--show-toplevel"], env }).trim())).toBe(realpathSync(intended));
      expect(runRepositoryGit({ repoRoot: intended, args: ["status", "--porcelain"], env })).toContain("tracked.txt");
      const start = captureRepositoryGitState({ repoRoot: intended, env });
      const end = captureRepositoryGitState({ repoRoot: intended, env });
      expect({ repositoryRoot: start.repositoryRoot, startCommit: start.commit, endCommit: end.commit, paths: end.paths }).toMatchObject({ repositoryRoot: realpathSync(intended), startCommit: intendedHead, endCommit: intendedHead, paths: ["tracked.txt"] });
      expect(sanitizedGitEnvironment(env)).not.toHaveProperty("GIT_DIR");
      expect(sanitizedGitEnvironment(env)).not.toHaveProperty("GIT_WORK_TREE");
      expect(sanitizedGitEnvironment(env)).not.toHaveProperty("GIT_INDEX_FILE");
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
