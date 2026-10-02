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

const PS_LSTART_AND_ARGS_LINE = /^\s*([A-Z][a-z]{2} [A-Z][a-z]{2}\s+\d{1,2} \d{2}:\d{2}:\d{2} \d{4})\s+(.*)$/;

export function parsePsProcessInfo(stdout) {
  const match = String(stdout ?? "").trim().match(PS_LSTART_AND_ARGS_LINE);
  if (!match) return null;

  const startedAt = Date.parse(match[1]);
  return Number.isFinite(startedAt) ? { startedAt, commandLine: match[2] } : null;
}

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

export function currentProcessStartedAt() {
  return Math.round(Date.now() - process.uptime() * 1000);
}
