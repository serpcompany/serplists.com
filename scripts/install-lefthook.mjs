import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

if (process.env.CI === "true" || process.env.CI === "1") {
  process.exit(0);
}

// Git documents these as repository-local environment variables. Inherited
// values can redirect both Git and Lefthook away from process.cwd(), which is
// especially dangerous when package installation is launched by another Git
// process or an agent harness.
const gitLocalEnvironmentVariables = [
  "GIT_ALTERNATE_OBJECT_DIRECTORIES",
  "GIT_CONFIG",
  "GIT_CONFIG_PARAMETERS",
  "GIT_CONFIG_COUNT",
  "GIT_OBJECT_DIRECTORY",
  "GIT_DIR",
  "GIT_WORK_TREE",
  "GIT_IMPLICIT_WORK_TREE",
  "GIT_GRAFT_FILE",
  "GIT_INDEX_FILE",
  "GIT_NO_REPLACE_OBJECTS",
  "GIT_REPLACE_REF_BASE",
  "GIT_PREFIX",
  "GIT_SHALLOW_FILE",
  "GIT_COMMON_DIR",
];
const sanitizedEnvironment = { ...process.env };
for (const variable of gitLocalEnvironmentVariables) delete sanitizedEnvironment[variable];

const git = (args, options = {}) =>
  spawnSync("git", args, {
    cwd: options.cwd,
    encoding: "utf8",
    env: sanitizedEnvironment,
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
    env: sanitizedEnvironment,
    shell: process.platform === "win32",
    stdio,
  });

const configuredHooksPath = git(["config", "--local", "--get-all", "core.hooksPath"], { cwd: repositoryRoot });
const hookPaths = configuredHooksPath.status === 0
  ? configuredHooksPath.stdout.split(/\r?\n/u).filter(Boolean)
  : [];
const hasStaleHuskyPath = hookPaths.some((value) => value.replace(/\/+$/u, "") === ".husky/_");

if (hasStaleHuskyPath) {
  // Let Lefthook remove any hooks it installed under the obsolete Husky path,
  // then return Git to its default hooks directory before reinstalling.
  runLefthook(["uninstall"]);
  const unset = git(["config", "--local", "--unset-all", "core.hooksPath"], { cwd: repositoryRoot });
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
