import { execFileSync } from "node:child_process";
import { copyFileSync, mkdirSync, mkdtempSync, realpathSync, rmSync, symlinkSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

// Copy tracked HEAD only: never recursively copy a working tree, .env files,
// ignored evidence, local Git configuration, hooks, or credentials.
export function createSanitizerCliFixture(sourceRoot) {
  const allocation = realpathSync(mkdtempSync(path.join(tmpdir(), "sanitizer-cli-checkout-")));
  const repoRoot = path.join(allocation, "repo");
  const home = path.join(allocation, "home");
  mkdirSync(home);
  const env = {
    PATH: process.env.PATH,
    HOME: home,
    TMPDIR: allocation,
    GIT_CONFIG_NOSYSTEM: "1",
    GIT_CONFIG_GLOBAL: "/dev/null",
    GIT_TERMINAL_PROMPT: "0",
    GIT_ALLOW_PROTOCOL: "file",
  };
  const git = (cwd, args) => execFileSync("git", args, { cwd, env, encoding: "utf8", stdio: ["ignore", "pipe", "pipe"] }).trim();
  try {
    const commit = git(sourceRoot, ["rev-parse", "HEAD"]);
    git(allocation, ["clone", "--quiet", "--no-local", "--depth=1", "--no-checkout", "--", pathToFileURL(sourceRoot).href, repoRoot]);
    git(repoRoot, ["checkout", "--quiet", "--detach", commit]);
    git(repoRoot, ["remote", "remove", "origin"]);
    for (const name of ["sanitizer-lib.mjs", "sanitize-rehearsal-export.mjs", "strict-json-lib.mjs"]) {
      copyFileSync(path.join(sourceRoot, "scripts/data", name), path.join(repoRoot, "scripts/data", name));
    }
    // Runtime packages only; the CLI itself must be a real file in this checkout
    // because it resolves its report/input roots from import.meta.url.
    symlinkSync(path.join(sourceRoot, "node_modules"), path.join(repoRoot, "node_modules"), "dir");
    return { allocation, repoRoot, commit, env, cleanup: () => rmSync(allocation, { recursive: true, force: true }) };
  } catch (error) {
    rmSync(allocation, { recursive: true, force: true });
    throw error;
  }
}
