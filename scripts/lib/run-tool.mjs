import { execFileSync, spawn } from "node:child_process";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { z } from "zod";

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const TOOL_PACKAGES = {
  "drizzle-kit": "drizzle-kit",
  next: "next",
  "opennextjs-cloudflare": "@opennextjs/cloudflare",
  playwright: "@playwright/test",
  tsx: "tsx",
  wrangler: "wrangler",
};

const toolManifestSchema = z.object({ bin: z.union([z.string(), z.record(z.string())]).optional() });

export function resolveToolBin(tool, { repoRoot = REPO_ROOT } = {}) {
  const packageName = Object.hasOwn(TOOL_PACKAGES, tool) ? TOOL_PACKAGES[tool] : null;
  if (!packageName) {
    throw new Error(`Unknown tool "${tool}". Add it to TOOL_PACKAGES in scripts/lib/run-tool.mjs.`);
  }

  const packageDir = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  let manifestText;
  try {
    manifestText = readFileSync(path.join(packageDir, "package.json"), "utf8");
  } catch (error) {
    throw new Error(`${packageName} is not installed. Run "pnpm install" first.`, { cause: error });
  }

  const manifest = toolManifestSchema.parse(JSON.parse(manifestText));
  const bin = typeof manifest.bin === "string" ? manifest.bin : manifest.bin?.[tool];
  if (typeof bin !== "string") {
    throw new Error(`${packageName} has no "${tool}" bin entry.`);
  }
  return path.join(packageDir, bin);
}

export function buildToolInvocation(tool, args = [], { execPath = process.execPath, repoRoot = REPO_ROOT } = {}) {
  return { command: execPath, args: [resolveToolBin(tool, { repoRoot }), ...args], options: {} };
}

const ARG_CMD_EXE_PASSES_UNCHANGED = /^[\w@+=:./\\-]+$/;

export function buildPnpmInvocation(
  args,
  { platform = process.platform, env = process.env, execPath = process.execPath } = {},
) {
  const entry = env.npm_execpath ?? "";
  if (/\.[cm]?js$/i.test(entry) && /pnpm/i.test(path.basename(entry))) {
    return { command: execPath, args: [entry, ...args], options: {} };
  }

  if (platform === "win32") {
    const unsafe = args.find((arg) => !ARG_CMD_EXE_PASSES_UNCHANGED.test(arg));
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

export function spawnTool(tool, args, options = {}) {
  const invocation = buildToolInvocation(tool, args);
  return spawn(invocation.command, invocation.args, { ...invocation.options, ...options });
}

export function execTool(tool, args, options = {}) {
  const invocation = buildToolInvocation(tool, args);
  return execFileSync(invocation.command, invocation.args, { ...invocation.options, ...options });
}

export function execPnpm(args, options = {}) {
  const invocation = buildPnpmInvocation(args);
  return execFileSync(invocation.command, invocation.args, { ...invocation.options, ...options });
}

export function killPidTree(pid, signal = "SIGTERM", { platform = process.platform } = {}) {
  if (platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  process.kill(pid, signal);
}

export function killProcessTree(child, signal = "SIGTERM", { platform = process.platform } = {}) {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return false;
  if (platform !== "win32") return child.kill(signal);

  try {
    killPidTree(child.pid, signal, { platform });
    return true;
  } catch {
    return false;
  }
}

export function describeSpawnError(error, label) {
  const message = error instanceof Error ? error.message : String(error);
  if (error?.code === "ENOENT" || error?.code === "EINVAL") {
    return `Could not start ${label}: ${message}. Launch tools through scripts/lib/run-tool.mjs, and run "pnpm install" if node_modules is missing.`;
  }
  return message;
}
