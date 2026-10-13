import { logLevels, type LogEntry, type LogLevelName, type LogSource } from "./logEntries";
import { formatEntry } from "./logFormat";
import {
  emptyFilter,
  parsePathPattern,
  parseSince,
  parseStatusRange,
  parseWhere,
  type LogFilter,
} from "./logQueries";

export type CommandResult = { output: string; exitCode: number };

export const filterOptionSpec = {
  since: { type: "string" },
  level: { type: "string", multiple: true },
  event: { type: "string", multiple: true },
  request: { type: "string" },
  path: { type: "string" },
  status: { type: "string" },
  where: { type: "string", multiple: true },
  limit: { type: "string" },
  json: { type: "boolean" },
  help: { type: "boolean", short: "h" },
} as const;

type FilterOptions = {
  since?: string;
  level?: string[];
  event?: string[];
  request?: string;
  path?: string;
  status?: string;
  where?: string[];
  source?: string[];
};

const sources: LogSource[] = ["api", "next"];

export class QueryError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly showUsage: boolean,
  ) {
    super(message);
  }
}

export const usageError = (message: string) => new QueryError(message, 2, true);

export const result = (output: string, exitCode = 0): CommandResult => ({ output, exitCode });

export function buildFilter(options: FilterOptions, nowMs: number): LogFilter {
  const levels = (options.level ?? []).map((level): LogLevelName => {
    const known = logLevels.find((name) => name === level);
    if (!known) throw usageError(`--level takes ${logLevels.join(", ")}, not "${level}".`);
    return known;
  });
  const chosenSources = (options.source ?? []).map((source) => {
    const known = sources.find((name) => name === source);
    if (!known) throw usageError(`--source takes api or next, not "${source}".`);
    return known;
  });
  try {
    return {
      ...emptyFilter,
      levels,
      sources: chosenSources,
      events: options.event ?? [],
      requestId: options.request,
      pathPattern: options.path === undefined ? undefined : parsePathPattern(options.path),
      status: options.status === undefined ? undefined : parseStatusRange(options.status),
      sinceMs: options.since === undefined ? undefined : parseSince(options.since, nowMs),
      where: (options.where ?? []).map(parseWhere),
    };
  } catch (error) {
    throw usageError(error instanceof Error ? error.message : String(error));
  }
}

export function parseLimit(text: string | undefined, fallback: number, max?: number): number {
  if (text === undefined) return fallback;
  const limit = Number(text);
  if (Number.isInteger(limit) && limit >= 1 && (max === undefined || limit <= max)) return limit;
  throw usageError(
    max === undefined
      ? `--limit takes a whole number above 0, not "${text}".`
      : `--limit takes a whole number from 1 to ${max}, not "${text}".`,
  );
}

export function linesCommand(entries: LogEntry[], limit: number, json: boolean): CommandResult {
  const shown = entries.slice(-limit);
  if (json) return result(JSON.stringify(shown, null, 2));
  if (shown.length === 0) return result("No lines match.");
  return result([`${shown.length} of ${entries.length} matching lines`, ...shown.map(formatEntry)].join("\n"));
}
