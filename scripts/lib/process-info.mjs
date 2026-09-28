// Read when a process started and its command line, so a recorded pid can be
// checked against the process that actually holds it now. Operating systems
// reuse pids, so a live pid alone does not prove it is the same process.
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { z } from "zod";

const execFileAsync = promisify(execFile);
const QUERY_TIMEOUT_MS = 15_000;

const windowsProcessSchema = z.object({
  startedAt: z.number().finite(),
  commandLine: z.string().nullable(),
});

function windowsQuery(pid) {
  return (
    `$p = Get-CimInstance Win32_Process -Filter "ProcessId=${pid}"; ` +
    "if ($p) { [pscustomobject]@{ startedAt = ([DateTimeOffset]$p.CreationDate).ToUnixTimeMilliseconds(); " +
    "commandLine = $p.CommandLine } | ConvertTo-Json -Compress }"
  );
}

/** Parses the PowerShell query's JSON; null when the process was not found or the output is unexpected. */
export function parseWindowsProcessInfo(stdout) {
  const text = String(stdout ?? "").trim();
  if (!text) return null;

  try {
    const parsed = windowsProcessSchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

// `ps -o lstart=,args=` with LC_ALL=C: "Mon Sep 28 06:30:00 2026 node scripts/dev-auto.mjs all".
const PS_LINE = /^\s*([A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s+(.*)$/;

/** Parses `ps` output (local time, whole seconds); null when it does not match. */
export function parsePsProcessInfo(stdout) {
  const match = String(stdout ?? "").trim().match(PS_LINE);
  if (!match) return null;

  const startedAt = Date.parse(match[1]);
  return Number.isFinite(startedAt) ? { startedAt, commandLine: match[2] } : null;
}

/**
 * `{ startedAt, commandLine }` for a pid (startedAt in epoch milliseconds), or
 * null when the process is gone, belongs to someone we cannot inspect, or the
 * query fails. Never throws.
 */
export async function readProcessInfo(pid, { platform = process.platform, run = execFileAsync } = {}) {
  if (!Number.isInteger(pid) || pid <= 0) return null;

  try {
    if (platform === "win32") {
      const { stdout } = await run(
        "powershell.exe",
        ["-NoProfile", "-NonInteractive", "-Command", windowsQuery(pid)],
        { encoding: "utf8", timeout: QUERY_TIMEOUT_MS, windowsHide: true },
      );
      return parseWindowsProcessInfo(stdout);
    }

    const { stdout } = await run("ps", ["-o", "lstart=", "-o", "args=", "-p", String(pid)], {
      encoding: "utf8",
      timeout: QUERY_TIMEOUT_MS,
      env: { ...process.env, LC_ALL: "C" },
    });
    return parsePsProcessInfo(stdout);
  } catch {
    return null;
  }
}

/** When the current process started, in epoch milliseconds (compare with readProcessInfo). */
export function currentProcessStartedAt() {
  return Math.round(Date.now() - process.uptime() * 1000);
}
