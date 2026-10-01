import type { ExecFileOptionsWithStringEncoding } from "node:child_process";

export type ProcessInfo = { startedAt: number; commandLine: string | null };
export type RunCommand = (
  file: string,
  args: readonly string[],
  options: ExecFileOptionsWithStringEncoding,
) => Promise<{ stdout: string }>;

export function parseWindowsProcessInfo(stdout: unknown): ProcessInfo | null;
export function parsePsProcessInfo(stdout: unknown): { startedAt: number; commandLine: string } | null;
export function readProcessInfo(
  pid: number,
  options?: { platform?: NodeJS.Platform; run?: RunCommand },
): Promise<ProcessInfo | null>;
export function currentProcessStartedAt(): number;
