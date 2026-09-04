import { execFileSync } from "node:child_process";
import { realpathSync } from "node:fs";

export function sanitizedGitEnvironment(source = process.env) {
  return {
    ...Object.fromEntries(Object.entries(source).filter(([name]) => !name.startsWith("GIT_"))),
    GIT_TERMINAL_PROMPT: "0",
  };
}

export function runRepositoryGit({ repoRoot, args, env = process.env, ...options }) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    env: sanitizedGitEnvironment(env),
    encoding: "utf8",
    ...options,
  });
}

export function captureRepositoryGitState({ repoRoot, env = process.env }) {
  const topLevel = runRepositoryGit({ repoRoot, args: ["rev-parse", "--show-toplevel"], env }).trim();
  if (realpathSync(topLevel) !== realpathSync(repoRoot)) throw new Error("Git context resolved outside the intended repository.");
  return {
    repositoryRoot: realpathSync(repoRoot),
    commit: runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"], env }).trim(),
    paths: runRepositoryGit({ repoRoot, args: ["status", "--porcelain", "--untracked-files=all"], env }).split(/\r?\n/).filter(Boolean).map((line) => line.slice(3)),
  };
}
