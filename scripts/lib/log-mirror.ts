import type { ChildProcess } from "node:child_process";
import { createWriteStream, mkdirSync, type WriteStream } from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

export const DEV_LOG_PATH = "tmp/logs/dev-all.log";
export const BROWSER_TEST_LOG_PATH = "tmp/logs/e2e-server.log";

export function mirrorOutputToLog(
  child: Pick<ChildProcess, "stdout" | "stderr" | "on">,
  logPath: string,
  { stdout = process.stdout, stderr = process.stderr }: { stdout?: NodeJS.WritableStream; stderr?: NodeJS.WritableStream } = {},
): WriteStream {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logFile = createWriteStream(logPath, { flags: "w" });
  const forward = (source: NodeJS.ReadableStream | null, target: NodeJS.WritableStream) => {
    if (!source) throw new Error(`Cannot mirror a child's output to ${logPath}: spawn it with stdout and stderr piped.`);
    source.on("data", (chunk: Buffer | string) => {
      target.write(chunk);
      logFile.write(stripVTControlCharacters(chunk.toString()));
    });
  };
  forward(child.stdout, stdout);
  forward(child.stderr, stderr);
  child.on("exit", () => logFile.end());
  return logFile;
}
