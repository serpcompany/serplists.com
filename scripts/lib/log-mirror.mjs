import { createWriteStream, mkdirSync } from "node:fs";
import path from "node:path";
import { stripVTControlCharacters } from "node:util";

export const DEV_LOG_PATH = "tmp/logs/dev-all.log";
export const BROWSER_TEST_LOG_PATH = "tmp/logs/e2e-server.log";

export function mirrorOutputToLog(child, logPath, { stdout = process.stdout, stderr = process.stderr } = {}) {
  mkdirSync(path.dirname(logPath), { recursive: true });
  const logFile = createWriteStream(logPath, { flags: "w" });
  const forward = (source, target) => {
    source.on("data", (chunk) => {
      target.write(chunk);
      logFile.write(stripVTControlCharacters(chunk.toString()));
    });
  };
  forward(child.stdout, stdout);
  forward(child.stderr, stderr);
  child.on("exit", () => logFile.end());
  return logFile;
}
