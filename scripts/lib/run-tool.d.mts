import type { ChildProcess, ExecFileSyncOptions, SpawnOptions } from "node:child_process";

export type ToolName = "concurrently" | "drizzle-kit" | "playwright" | "tsx" | "vite" | "wrangler";

export interface Invocation {
  command: string;
  args: string[];
  options: { windowsVerbatimArguments?: boolean };
}

export const REPO_ROOT: string;
export const TOOL_PACKAGES: Record<ToolName, string>;

export function resolveToolBin(tool: ToolName, options?: { repoRoot?: string }): string;
export function buildToolInvocation(
  tool: ToolName,
  args?: string[],
  options?: { execPath?: string; repoRoot?: string },
): Invocation;
export function buildPnpmInvocation(
  args: string[],
  options?: { platform?: NodeJS.Platform; env?: NodeJS.ProcessEnv; execPath?: string },
): Invocation;
export function buildShellCommandLine(
  invocation: { command: string; args: string[] },
  platform?: NodeJS.Platform,
): string;
export function spawnTool(tool: ToolName, args: string[], options?: SpawnOptions): ChildProcess;
export function execTool(tool: ToolName, args: string[], options?: ExecFileSyncOptions): string | Buffer;
export function execPnpm(args: string[], options?: ExecFileSyncOptions): string | Buffer;
export function killProcessTree(
  child: ChildProcess,
  signal?: NodeJS.Signals,
  options?: { platform?: NodeJS.Platform },
): void;
export function describeSpawnError(error: unknown, label: string): string;
