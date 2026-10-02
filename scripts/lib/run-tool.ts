import {
  type ChildProcess,
  execFileSync,
  type ExecFileSyncOptions,
  type ExecFileSyncOptionsWithStringEncoding,
  spawn,
  type SpawnOptions,
} from "node:child_process";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { z } from "zod";

export interface Invocation {
  command: string;
  args: string[];
  options: { windowsVerbatimArguments?: boolean };
}

export const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export const TOOL_PACKAGES = {
  "drizzle-kit": "drizzle-kit",
  next: "next",
  "opennextjs-cloudflare": "@opennextjs/cloudflare",
  playwright: "@playwright/test",
  wrangler: "wrangler",
};

export type ToolName = keyof typeof TOOL_PACKAGES;

const toolManifestSchema = z.object({ bin: z.union([z.string(), z.record(z.string())]).optional() });

export function resolveToolBin(tool: ToolName, { repoRoot = REPO_ROOT }: { repoRoot?: string } = {}): string {
  const packageName = TOOL_PACKAGES[tool];
  const packageDir = path.join(repoRoot, "node_modules", ...packageName.split("/"));
  let manifestText: string;
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

export function buildToolInvocation(
  tool: ToolName,
  args: readonly string[] = [],
  { execPath = process.execPath, repoRoot = REPO_ROOT }: { execPath?: string; repoRoot?: string } = {},
): Invocation {
  return { command: execPath, args: [resolveToolBin(tool, { repoRoot }), ...args], options: {} };
}

function tsxLoaderUrl({ repoRoot = REPO_ROOT }: { repoRoot?: string } = {}): string {
  return pathToFileURL(createRequire(path.join(repoRoot, "package.json")).resolve("tsx")).href;
}

export function buildScriptInvocation(
  script: string,
  args: readonly string[] = [],
  { execPath = process.execPath, repoRoot = REPO_ROOT }: { execPath?: string; repoRoot?: string } = {},
): Invocation {
  return { command: execPath, args: ["--import", tsxLoaderUrl({ repoRoot }), script, ...args], options: {} };
}

const ARG_CMD_EXE_PASSES_UNCHANGED = /^[\w@+=:./\\-]+$/;

export function buildPnpmInvocation(
  args: readonly string[],
  {
    platform = process.platform,
    env = process.env,
    execPath = process.execPath,
  }: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; execPath?: string } = {},
): Invocation {
  const entry = env["npm_execpath"] ?? "";
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

  return { command: "pnpm", args: [...args], options: {} };
}

function spawnInvocation(invocation: Invocation, options: SpawnOptions): ChildProcess {
  return spawn(invocation.command, invocation.args, { ...invocation.options, ...options });
}

function execInvocation(invocation: Invocation, options: ExecFileSyncOptionsWithStringEncoding): string;
function execInvocation(invocation: Invocation, options: ExecFileSyncOptions): string | Buffer;
function execInvocation(invocation: Invocation, options: ExecFileSyncOptions): string | Buffer {
  return execFileSync(invocation.command, invocation.args, { ...invocation.options, ...options });
}

export function spawnTool(tool: ToolName, args: readonly string[], options: SpawnOptions = {}): ChildProcess {
  return spawnInvocation(buildToolInvocation(tool, args), options);
}

export function execTool(tool: ToolName, args: readonly string[], options: ExecFileSyncOptionsWithStringEncoding): string;
export function execTool(tool: ToolName, args: readonly string[], options?: ExecFileSyncOptions): string | Buffer;
export function execTool(tool: ToolName, args: readonly string[], options: ExecFileSyncOptions = {}): string | Buffer {
  return execInvocation(buildToolInvocation(tool, args), options);
}

export function execScript(script: string, args: readonly string[], options: ExecFileSyncOptionsWithStringEncoding): string;
export function execScript(script: string, args: readonly string[], options?: ExecFileSyncOptions): string | Buffer;
export function execScript(script: string, args: readonly string[], options: ExecFileSyncOptions = {}): string | Buffer {
  return execInvocation(buildScriptInvocation(script, args), options);
}

export function execPnpm(args: readonly string[], options: ExecFileSyncOptionsWithStringEncoding): string;
export function execPnpm(args: readonly string[], options?: ExecFileSyncOptions): string | Buffer;
export function execPnpm(args: readonly string[], options: ExecFileSyncOptions = {}): string | Buffer {
  return execInvocation(buildPnpmInvocation(args), options);
}

export function killPidTree(
  pid: number,
  signal: NodeJS.Signals = "SIGTERM",
  { platform = process.platform }: { platform?: NodeJS.Platform } = {},
): void {
  if (platform === "win32") {
    execFileSync("taskkill", ["/PID", String(pid), "/T", "/F"], { stdio: "ignore" });
    return;
  }
  process.kill(pid, signal);
}

export function killProcessTree(
  child: ChildProcess,
  signal: NodeJS.Signals = "SIGTERM",
  { platform = process.platform }: { platform?: NodeJS.Platform } = {},
): boolean {
  if (!child.pid || child.exitCode !== null || child.signalCode !== null) return false;
  if (platform !== "win32") return child.kill(signal);

  try {
    killPidTree(child.pid, signal, { platform });
    return true;
  } catch {
    return false;
  }
}

const spawnErrorSchema = z.object({ code: z.string() });

export function describeSpawnError(error: unknown, label: string): string {
  const message = error instanceof Error ? error.message : String(error);
  const code = spawnErrorSchema.safeParse(error).data?.code;
  if (code === "ENOENT" || code === "EINVAL") {
    return `Could not start ${label}: ${message}. Launch tools through scripts/lib/run-tool.ts, and run "pnpm install" if node_modules is missing.`;
  }
  return message;
}
