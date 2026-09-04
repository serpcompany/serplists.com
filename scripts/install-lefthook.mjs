import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" || process.env.CI === "1") {
  process.exit(0);
}

const git = (args, options = {}) =>
  spawnSync("git", args, {
    encoding: "utf8",
    stdio: options.stdio ?? "pipe",
  });

const repository = git(["rev-parse", "--show-toplevel"]);
if (repository.status !== 0) {
  process.exit(0);
}

const repositoryRoot = repository.stdout.trim();
const lefthookExecutable = fileURLToPath(
  new URL(
    process.platform === "win32" ? "../node_modules/.bin/lefthook.cmd" : "../node_modules/.bin/lefthook",
    import.meta.url,
  ),
);

if (!existsSync(lefthookExecutable)) {
  console.error(`Lefthook executable is missing: ${lefthookExecutable}`);
  process.exit(1);
}

const runLefthook = (args, stdio = "inherit") =>
  spawnSync(lefthookExecutable, args, {
    cwd: repositoryRoot,
    shell: process.platform === "win32",
    stdio,
  });

const configuredHooksPath = git(["config", "--local", "--get-all", "core.hooksPath"]);
const hookPaths = configuredHooksPath.status === 0
  ? configuredHooksPath.stdout.split(/\r?\n/u).filter(Boolean)
  : [];
const hasStaleHuskyPath = hookPaths.some((value) => value.replace(/\/+$/u, "") === ".husky/_");

if (hasStaleHuskyPath) {
  // Let Lefthook remove any hooks it installed under the obsolete Husky path,
  // then return Git to its default hooks directory before reinstalling.
  runLefthook(["uninstall"]);
  const unset = git(["config", "--local", "--unset-all", "core.hooksPath"]);
  if (unset.status !== 0 && unset.status !== 5) {
    console.error(unset.stderr.trim() || "Failed to clear stale core.hooksPath");
    process.exit(unset.status ?? 1);
  }
}

const result = runLefthook(["install"]);

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}

const verified = runLefthook(["check-install"], "pipe");
if (verified.status !== 0) {
  console.error("Lefthook installation verification failed.");
  process.exit(verified.status ?? 1);
}
