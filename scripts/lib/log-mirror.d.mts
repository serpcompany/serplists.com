import type { ChildProcess } from "node:child_process";
import type { WriteStream } from "node:fs";

export const DEV_LOG_PATH: string;
export const BROWSER_TEST_LOG_PATH: string;

export function mirrorOutputToLog(
  child: Pick<ChildProcess, "stdout" | "stderr" | "on">,
  logPath: string,
  targets?: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream },
): WriteStream;
