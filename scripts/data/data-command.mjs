#!/usr/bin/env node
import { execFileSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { runDataCommand } from "./data-command-lib.mjs";
import { runRepositoryGit, sanitizedGitEnvironment } from "./git-subprocess-env.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");

function runCommand(command) {
  return execFileSync(command[0], command.slice(1), {
    cwd: repoRoot,
    env: sanitizedGitEnvironment(),
    encoding: "utf8",
    stdio: ["inherit", "pipe", process.argv[2] === "recovery-restore" ? "pipe" : "inherit"],
  });
}

try {
  const gitCommit = runRepositoryGit({ repoRoot, args: ["rev-parse", "HEAD"] }).trim();
  runDataCommand({
    argv: process.argv.slice(2),
    repoRoot,
    gitCommit,
    write: (value) => process.stdout.write(`${value}\n`),
    runCommand,
  });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
