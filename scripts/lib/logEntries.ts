import { stripVTControlCharacters } from "node:util";
import { z } from "zod";

export const logLevels = ["debug", "info", "warn", "error"] as const;
export type LogLevelName = (typeof logLevels)[number];
export type LogSource = "api" | "next";

export type LogEntry = {
  lineNumber: number;
  source: LogSource;
  level: LogLevelName;
  event: string;
  timestamp: string | undefined;
  requestId: string | undefined;
  fields: LogFields;
};

export interface LogFields extends Record<string, unknown> {
  method?: unknown;
  path?: unknown;
  status?: unknown;
  durationMs?: unknown;
  errorName?: unknown;
}

type ParsedLine = Omit<LogEntry, "lineNumber">;

const apiLineSchema = z
  .object({
    level: z.enum(logLevels),
    message: z.string(),
    timestamp: z.string().optional(),
    requestId: z.string().optional(),
  })
  .passthrough();

const nextAccessLine =
  /^\s*(?<method>GET|HEAD|POST|PUT|PATCH|DELETE|OPTIONS)\s+(?<path>\S+)\s+(?<status>\d{3})\s+in\s+(?<duration>\d+(?:\.\d+)?)(?<unit>ms|s)(?:\s+\((?<breakdown>[^)]*)\))?\s*$/;
const breakdownTiming = /^\s*(?<name>[\w.-]+):\s*(?<duration>\d+(?:\.\d+)?)(?<unit>ms|s)\s*$/;

const toMilliseconds = (duration: string, unit: string) => (unit === "s" ? Number(duration) * 1000 : Number(duration));

const camelCase = (name: string) =>
  name
    .split(/[^A-Za-z0-9]+/)
    .filter(Boolean)
    .map((word, index) => (index === 0 ? word.toLowerCase() : word[0]?.toUpperCase() + word.slice(1).toLowerCase()))
    .join("");

function parseApiLine(text: string): ParsedLine | null {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  if (start === -1 || end <= start) return null;
  let value: unknown;
  try {
    value = JSON.parse(text.slice(start, end + 1));
  } catch {
    return null;
  }
  const parsed = apiLineSchema.safeParse(value);
  if (!parsed.success) return null;
  const { level, message, timestamp, requestId, ...fields } = parsed.data;
  return { source: "api", level, event: message, timestamp, requestId, fields };
}

function parseNextAccessLine(text: string): ParsedLine | null {
  const groups = nextAccessLine.exec(text)?.groups;
  if (!groups) return null;
  const { method, path, status, duration, unit, breakdown } = groups;
  const fields: LogFields = {
    method,
    path,
    status: Number(status),
    durationMs: toMilliseconds(duration ?? "0", unit ?? "ms"),
  };
  for (const part of (breakdown ?? "").split(",")) {
    const timing = breakdownTiming.exec(part)?.groups;
    if (!timing) continue;
    const { name, duration: timingDuration, unit: timingUnit } = timing;
    if (name) fields[`${camelCase(name)}Ms`] = toMilliseconds(timingDuration ?? "0", timingUnit ?? "ms");
  }
  return { source: "next", level: "info", event: "next_request", timestamp: undefined, requestId: undefined, fields };
}

export function parseLogText(text: string): LogEntry[] {
  const entries: LogEntry[] = [];
  let lastTimestamp: string | undefined;
  text.split(/\r?\n/).forEach((rawLine, index) => {
    const line = stripVTControlCharacters(rawLine);
    const parsed = parseApiLine(line) ?? parseNextAccessLine(line);
    if (!parsed) return;
    if (parsed.timestamp) lastTimestamp = parsed.timestamp;
    entries.push({ ...parsed, timestamp: parsed.timestamp ?? lastTimestamp, lineNumber: index + 1 });
  });
  return entries;
}

export type RequestKind = "api" | "page";

export type RequestRecord = {
  kind: RequestKind;
  method: string;
  path: string;
  status: number;
  durationMs: number;
  requestId: string | undefined;
  timestamp: string | undefined;
  lineNumber: number;
};

const requestFieldsSchema = z.object({
  method: z.string(),
  path: z.string(),
  status: z.number(),
  durationMs: z.number(),
});

export function requestRecords(entries: LogEntry[]): RequestRecord[] {
  return entries.flatMap((entry): RequestRecord[] => {
    const isApiRequest = entry.source === "api" && entry.event === "api_request";
    const isPageRequest = entry.source === "next" && entry.event === "next_request";
    if (!isApiRequest && !isPageRequest) return [];
    const parsed = requestFieldsSchema.safeParse(entry.fields);
    if (!parsed.success) return [];
    const path = isApiRequest ? `/api/${parsed.data.path.replace(/^\/+/, "")}` : parsed.data.path;
    if (isPageRequest && path.startsWith("/api/")) return [];
    return [
      {
        kind: isApiRequest ? "api" : "page",
        ...parsed.data,
        path,
        requestId: entry.requestId,
        timestamp: entry.timestamp,
        lineNumber: entry.lineNumber,
      },
    ];
  });
}
