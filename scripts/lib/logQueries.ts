import { z } from "zod";
import type { LogEntry, LogLevelName, LogSource, RequestKind, RequestRecord } from "./logEntries";

export type StatusRange = { min: number; max: number };

export type LogFilter = {
  levels: LogLevelName[];
  events: string[];
  requestId: string | undefined;
  pathPattern: RegExp | undefined;
  status: StatusRange | undefined;
  sinceMs: number | undefined;
  where: Array<{ field: string; value: string }>;
  sources: LogSource[];
};

export const emptyFilter: LogFilter = {
  levels: [],
  events: [],
  requestId: undefined,
  pathPattern: undefined,
  status: undefined,
  sinceMs: undefined,
  where: [],
  sources: [],
};

const durationUnits: Record<string, number> = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };

export function parseStatusRange(text: string): StatusRange {
  const family = /^([1-5])xx$/i.exec(text);
  if (family?.[1]) return { min: Number(family[1]) * 100, max: Number(family[1]) * 100 + 99 };
  if (/^[1-5]\d\d$/.test(text)) return { min: Number(text), max: Number(text) };
  throw new Error(`--status takes a code such as 404 or a family such as 5xx, not "${text}".`);
}

export function parseSince(text: string, nowMs: number): number {
  const relative = /^(\d+)([smhd])$/.exec(text);
  if (relative?.[1] && relative[2]) return nowMs - Number(relative[1]) * (durationUnits[relative[2]] ?? 0);
  const absolute = Date.parse(text);
  if (Number.isNaN(absolute)) throw new Error(`--since takes a duration such as 15m, 2h or 1d, or a date, not "${text}".`);
  return absolute;
}

export function parsePathPattern(text: string): RegExp {
  const literal = /^\/(.+)\/([a-z]*)$/.exec(text);
  if (literal?.[1]) return new RegExp(literal[1], literal[2]);
  return new RegExp(text.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
}

export function parseWhere(text: string): { field: string; value: string } {
  const separator = text.indexOf("=");
  if (separator < 1) throw new Error(`--where takes field=value, not "${text}".`);
  return { field: text.slice(0, separator), value: text.slice(separator + 1) };
}

const fieldText = (value: unknown) => (typeof value === "string" ? value : JSON.stringify(value));

export function matchesFilter(entry: LogEntry, filter: LogFilter): boolean {
  if (filter.levels.length > 0 && !filter.levels.includes(entry.level)) return false;
  if (filter.events.length > 0 && !filter.events.includes(entry.event)) return false;
  if (filter.sources.length > 0 && !filter.sources.includes(entry.source)) return false;
  if (filter.requestId && !entry.requestId?.startsWith(filter.requestId)) return false;
  if (filter.pathPattern && !filter.pathPattern.test(String(entry.fields.path ?? ""))) return false;
  if (filter.status) {
    const status = Number(entry.fields.status);
    if (!(status >= filter.status.min && status <= filter.status.max)) return false;
  }
  if (filter.sinceMs !== undefined) {
    const at = Date.parse(entry.timestamp ?? "");
    if (Number.isNaN(at) || at < filter.sinceMs) return false;
  }
  return filter.where.every(({ field, value }) => fieldText(entry.fields[field]) === value);
}

const uuidSegment = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const isIdentifierSegment = (segment: string) =>
  uuidSegment.test(segment) ||
  /^\d+$/.test(segment) ||
  (/\d/.test(segment) && segment.length >= 6) ||
  segment.length >= 24 ||
  (/[a-z]/.test(segment) && /[A-Z]/.test(segment) && segment.length >= 10);

export function normalizeRoute(path: string): string {
  const [withoutQuery = ""] = path.split("?");
  return withoutQuery
    .split("/")
    .map((segment) => (segment.startsWith(":") || !isIdentifierSegment(segment) ? segment : ":id"))
    .join("/");
}

export function percentile(values: number[], fraction: number): number {
  if (values.length === 0) return 0;
  const sorted = [...values].sort((left, right) => left - right);
  const rank = Math.min(sorted.length - 1, Math.max(0, Math.ceil(fraction * sorted.length) - 1));
  return sorted[rank] ?? 0;
}

const d1QueryFieldsSchema = z.object({
  sql: z.string(),
  rowsRead: z.number(),
  rowsWritten: z.number(),
  durationMs: z.number(),
});

export type RouteStats = {
  route: string;
  kind: RequestKind;
  count: number;
  clientErrors: number;
  serverErrors: number;
  p50Ms: number;
  p95Ms: number;
  maxMs: number;
  p95RowsRead: number | undefined;
  maxRowsRead: number | undefined;
};

export function rowsReadByRequest(entries: LogEntry[]): Map<string, number> {
  const totals = new Map<string, number>();
  for (const entry of entries) {
    if (entry.event !== "d1_query" || !entry.requestId) continue;
    const parsed = d1QueryFieldsSchema.safeParse(entry.fields);
    if (parsed.success) totals.set(entry.requestId, (totals.get(entry.requestId) ?? 0) + parsed.data.rowsRead);
  }
  return totals;
}

export function summarizeRoutes(records: RequestRecord[], rowsRead: Map<string, number> = new Map()): RouteStats[] {
  const groups = new Map<string, RequestRecord[]>();
  for (const record of records) {
    const key = `${record.kind} ${record.method} ${normalizeRoute(record.path)}`;
    groups.set(key, [...(groups.get(key) ?? []), record]);
  }
  return [...groups.values()]
    .map((group) => {
      const first = group[0];
      const durations = group.map((record) => record.durationMs);
      const rows = group.flatMap((record) => {
        const read = record.requestId === undefined ? undefined : rowsRead.get(record.requestId);
        return read === undefined ? [] : [read];
      });
      return {
        route: `${first?.method ?? ""} ${normalizeRoute(first?.path ?? "")}`,
        kind: first?.kind ?? "api",
        count: group.length,
        clientErrors: group.filter((record) => record.status >= 400 && record.status < 500).length,
        serverErrors: group.filter((record) => record.status >= 500).length,
        p50Ms: percentile(durations, 0.5),
        p95Ms: percentile(durations, 0.95),
        maxMs: Math.max(...durations),
        p95RowsRead: rows.length === 0 ? undefined : percentile(rows, 0.95),
        maxRowsRead: rows.length === 0 ? undefined : Math.max(...rows),
      };
    })
    .sort((left, right) => right.p95Ms - left.p95Ms || right.count - left.count);
}

export function slowestRequests(records: RequestRecord[], limit: number): RequestRecord[] {
  return [...records].sort((left, right) => right.durationMs - left.durationMs).slice(0, limit);
}

export type TimelineRow = { offsetMs: number | undefined; entry: LogEntry };

export function requestTimeline(entries: LogEntry[], requestId: string): TimelineRow[] {
  const lines = entries.filter((entry) => entry.requestId?.startsWith(requestId));
  const times = lines.map((entry) => Date.parse(entry.timestamp ?? "")).filter((at) => !Number.isNaN(at));
  const start = times.length > 0 ? Math.min(...times) : undefined;
  return lines
    .map((entry) => {
      const at = Date.parse(entry.timestamp ?? "");
      return { offsetMs: start === undefined || Number.isNaN(at) ? undefined : at - start, entry };
    })
    .sort((left, right) => (left.offsetMs ?? 0) - (right.offsetMs ?? 0) || left.entry.lineNumber - right.entry.lineNumber);
}


export type StatementStats = {
  statement: string;
  count: number;
  rowsRead: number;
  rowsWritten: number;
  maxRowsRead: number;
  totalMs: number;
};

export function normalizeStatement(sql: string): string {
  return sql
    .replace(/'(?:[^']|'')*'/g, "?")
    .replace(/\b\d+(?:\.\d+)?\b/g, "?")
    .replace(/\s+/g, " ")
    .trim();
}

export function summarizeStatements(entries: LogEntry[]): StatementStats[] {
  const groups = new Map<string, StatementStats>();
  for (const entry of entries) {
    if (entry.event !== "d1_query") continue;
    const parsed = d1QueryFieldsSchema.safeParse(entry.fields);
    if (!parsed.success) continue;
    const statement = normalizeStatement(parsed.data.sql);
    const totals = groups.get(statement) ?? { statement, count: 0, rowsRead: 0, rowsWritten: 0, maxRowsRead: 0, totalMs: 0 };
    totals.count += 1;
    totals.rowsRead += parsed.data.rowsRead;
    totals.rowsWritten += parsed.data.rowsWritten;
    totals.maxRowsRead = Math.max(totals.maxRowsRead, parsed.data.rowsRead);
    totals.totalMs += parsed.data.durationMs;
    groups.set(statement, totals);
  }
  return [...groups.values()].sort((left, right) => right.rowsRead - left.rowsRead || right.count - left.count);
}

export type ErrorGroup = { event: string; errorName: string; count: number; lastRequestId: string | undefined };

export const isProblem = (entry: LogEntry) =>
  entry.level === "error" || entry.level === "warn" || Number(entry.fields.status) >= 500;

export function summarizeErrors(entries: LogEntry[]): ErrorGroup[] {
  const groups = new Map<string, ErrorGroup>();
  for (const entry of entries.filter(isProblem)) {
    const errorName = typeof entry.fields.errorName === "string" ? entry.fields.errorName : String(entry.fields.status ?? "");
    const key = `${entry.event} ${errorName}`;
    const group = groups.get(key) ?? { event: entry.event, errorName, count: 0, lastRequestId: undefined };
    group.count += 1;
    group.lastRequestId = entry.requestId ?? group.lastRequestId;
    groups.set(key, group);
  }
  return [...groups.values()].sort((left, right) => right.count - left.count);
}
