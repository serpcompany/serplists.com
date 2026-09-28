// Launch repo tools (wrangler, vite, tsx, ...) and pnpm from Node scripts the same
// way on every OS. Scripts must not spawn "npx" or "pnpm" by name: on Windows they
// exist only as .cmd shims, so a spawn without a shell fails with ENOENT, and
// spawning a .cmd file without a shell fails with EINVAL (Node 18.20.2+).
// Joining arguments for a shell instead lets cmd.exe reinterpret & | ^ % and
// spaces in values such as secrets from .dev.vars.
//
// So local tools run as `node <package bin script>`, which needs no shell, and
// pnpm runs through the pnpm script that launched us (npm_execpath).
import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

// Tool name -> the package that ships its bin. Add an entry to launch a new tool.
export const TOOL_PACKAGES = {
  concurrently: "concurrently",
  "drizzle-kit": "drizzle-kit",
  playwright: "@playwright/test",
  tsx: "tsx",
  vite: "vite",
  wrangler: "wrangler",
};

/** Absolute path to the bin script of a local tool, read from its package.json. */
export function resolveToolBin(tool, { repoRoot = REPO_ROOT } = {}) {
  const packageName = Object.hasOwn(TOOL_PACKAGES, tool) ? TOOL_PACKAGES[tool] : null;
  if (!packageName) {
    throw new Error(`Unknown tool "${tool}". Add it to TOOL_PACKAGES in scripts/lib/run-tool.mjs.`);
  }

  const packageDir = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(path.join(packageDir, "package.json"), "utf8"));
  } catch (error) {
    throw new Error(`${packageName} is not installed. Run "pnpm install" first.`, { cause: error });
  }

  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[tool];
  if (typeof bin !== "string") {
    throw new Error(`${packageName} has no "${tool}" bin entry.`);
  }
  return path.join(packageDir, bin);
}

/** `{ command, args }` that runs a local tool with the current Node, without a shell. */
export function buildToolInvocation(tool, args = [], { execPath = process.execPath, repoRoot = REPO_ROOT } = {}) {
  return { command: execPath, args: [resolveToolBin(tool, { repoRoot }), ...args], options: {} };
}

// Plain tokens that cmd.exe passes through unchanged.
const PLAIN_CMD_ARG = /^[\w@+=:./\\-]+$/;

/**
 * `{ command, args, options }` that runs pnpm itself (for `pnpm run <script>`).
 * Prefers the pnpm entry script that started this process (`pnpm run` sets
 * npm_execpath), so no shell is involved. Otherwise Windows goes through
 * cmd.exe, which only accepts plain arguments here.
 */
export function buildPnpmInvocation(
  args,
  { platform = process.platform, env = process.env, execPath = process.execPath } = {},
) {
  const entry = env.npm_execpath ?? "";
  if (/\.[cm]?js$/i.test(entry) && /pnpm/i.test(path.basename(entry))) {
    return { command: execPath, args: [entry, ...args], options: {} };
  }

  if (platform === "win32") {
    const unsafe = args.find((arg) => !PLAIN_CMD_ARG.test(arg));
    if (unsafe !== undefined) {
      throw new Error(
        `Cannot pass "${unsafe}" to pnpm through cmd.exe. Run this script with "pnpm run", or launch the tool with execTool/spawnTool.`,
      );
    }
    return {
      command: "cmd.exe",
      args: ["/d", "/s", "/c", `"pnpm ${args.join(" ")}"`],
      options: { windowsVerbatimArguments: true },
    };
  }

  return { command: "pnpm", args, options: {} };
}

// cmd.exe metacharacters, escaped with ^ (the approach cross-spawn uses, from https://qntm.org/cmd).
const CMD_META_CHARS = /([()\][%!^"`<>&|;, *?])/g;

function quoteCmdArg(arg) {
  const quoted = `"${String(arg)
    // Backslashes before a quote are doubled, and the quote is escaped for the C runtime.
    .replace(/(\\*)"/g, '$1$1\\"')
    // Trailing backslashes are doubled so they do not escape the closing quote.
    .replace(/(\\*)$/, "$1$1")}"`;
  return quoted.replace(CMD_META_CHARS, "^$1");
}

function quotePosixArg(arg) {
  const value = String(arg);
  if (/^[\w@%+=:,./-]+$/.test(value)) return value;
  return `'${value.replace(/'/g, "'\\''")}'`;
}

/**
 * One shell command line for an invocation, for tools that take a command
 * string and run it through a shell (concurrently runs `cmd.exe /s /c "<line>"`
 * on Windows and `/bin/sh -c <line>` elsewhere). Every argument reaches the
 * program literally, including spaces, quotes and & | ^ % $ characters.
 */
export function buildShellCommandLine({ command, args }, platform = process.platform) {
  if (platform === "win32") {
    return [command.replace(CMD_META_CHARS, "^$1"), ...args.map(quoteCmdArg)].join(" ");
  }
  return [command, ...args].map(quotePosixArg).join(" ");
}

/** spawn() a local tool (see TOOL_PACKAGES) with the current Node. */
export function spawnTool(tool, args, options = {}) {
  const invocation = buildToolInvocation(tool, args);
  return spawn(invocation.command, invocation.args, { ...invocation.options, ...options });
}

/** execFileSync() a local tool (see TOOL_PACKAGES) with the current Node. */
export function execTool(tool, args, options = {}) {
  const invocation = buildToolInvocation(tool, args);
  return execFileSync(invocation.command, invocation.args, { ...invocation.options, ...options });
}

/** execFileSync() pnpm itself, e.g. `execPnpm(["run", "build:dev"])`. */
export function execPnpm(args, options = {}) {
  const invocation = buildPnpmInvocation(args);
  return execFileSync(invocation.command, invocation.args, { ...invocation.options, ...options });
}

/**
 * Stop a child and everything it started. On Windows, killing the direct child
 * leaves its children (Vite, workerd) running and holding their ports, so the
 * whole tree is ended with taskkill.
 */
export function killProcessTree(child, signal = "SIGTERM", { platform = process.platform } = {}) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return;

  if (platform === "win32") {
    try {
      execFileSync("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
    } catch {
      // The process already exited.
    }
    return;
  }

  child.kill(signal);
}

/** A clearer message when a tool could not be started at all. */
export function describeSpawnError(error, label) {
  const message = error instanceof Error ? error.message : String(error);
  if (error?.code === "ENOENT" || error?.code === "EINVAL") {
    return `Could not start ${label}: ${message}. Launch tools through scripts/lib/run-tool.mjs, and run "pnpm install" if node_modules is missing.`;
  }
  return message;
}
