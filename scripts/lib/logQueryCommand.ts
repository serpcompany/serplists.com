import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { parseArgs } from "node:util";
import { logLevels, parseLogText, requestRecords, type LogEntry, type LogLevelName, type LogSource } from "./logEntries";
import { formatEntry, formatTable, milliseconds } from "./logFormat";
import {
  emptyFilter,
  isProblem,
  matchesFilter,
  normalizeRoute,
  parsePathPattern,
  parseSince,
  parseStatusRange,
  parseWhere,
  requestTimeline,
  rowsReadByRequest,
  slowestRequests,
  summarizeErrors,
  summarizeRoutes,
  summarizeStatements,
  type LogFilter,
} from "./logQueries";

import { BROWSER_TEST_LOG_PATH, DEV_LOG_PATH } from "./log-mirror";

export const defaultLogFile = DEV_LOG_PATH;
export const browserTestLogFile = BROWSER_TEST_LOG_PATH;

export const usage = `Query the logs of the local stack: the API's JSON lines and Next.js's page lines.

Usage: pnpm run logs:query [command] [options]

Commands:
  lines            log lines that match the options (the default)
  errors           warnings, errors and 5xx requests, grouped, then the latest lines
  request <id>     one request's lines in order, with time offsets
  routes           requests per route: count, 4xx, 5xx, p50, p95 and max duration
  slow             the slowest requests, with their request ids
  d1               D1 statements by rows read (needs D1_PROFILE=true in .dev.vars)

Options:
  --file <path>    a log file, or a folder whose newest .log file is read (repeatable).
                   Default ${defaultLogFile} (pnpm run dev:all); the browser tests'
                   server writes ${browserTestLogFile}
  --since <when>   only lines from a duration ago (30s, 15m, 2h, 1d) or a date on
  --level <level>  debug, info, warn or error (repeatable)
  --event <name>   an event such as api_request or mcp_tool_error (repeatable)
  --request <id>   a request id, or the start of one
  --path <text>    a path containing the text, or matching /regex/
  --status <code>  a status such as 404, or a family such as 5xx
  --where <f=v>    a field equal to a value, such as errorName=TypeError (repeatable)
  --source <name>  api or next (repeatable)
  --limit <n>      lines or rows to show (default 50 lines, 20 rows)
  --json           print the result as JSON
`;

export type CommandResult = { output: string; exitCode: number };

const commands = ["lines", "errors", "request", "routes", "slow", "d1"] as const;
type CommandName = (typeof commands)[number];
const sources: LogSource[] = ["api", "next"];

const optionSpec = {
  file: { type: "string", multiple: true },
  since: { type: "string" },
  level: { type: "string", multiple: true },
  event: { type: "string", multiple: true },
  request: { type: "string" },
  path: { type: "string" },
  status: { type: "string" },
  where: { type: "string", multiple: true },
  source: { type: "string", multiple: true },
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

class QueryError extends Error {
  constructor(
    message: string,
    readonly exitCode: number,
    readonly showUsage: boolean,
  ) {
    super(message);
  }
}

const usageError = (message: string) => new QueryError(message, 2, true);

function newestLogFile(folder: string): string | undefined {
  return readdirSync(folder)
    .filter((name) => name.endsWith(".log"))
    .map((name) => path.join(folder, name))
    .sort((left, right) => statSync(right).mtimeMs - statSync(left).mtimeMs)[0];
}

function readLogFiles(files: string[]): { entries: LogEntry[]; read: string[] } {
  const entries: LogEntry[] = [];
  const read: string[] = [];
  for (const requested of files) {
    if (!existsSync(requested)) {
      const hint = requested === defaultLogFile ? " Start the app with pnpm run dev:all, which writes it, or pass --file <path>." : "";
      throw new QueryError(`No log at ${requested}.${hint}`, 1, false);
    }
    const file = statSync(requested).isDirectory() ? newestLogFile(requested) : requested;
    if (!file) throw new QueryError(`No .log file in ${requested}.`, 1, false);
    entries.push(...parseLogText(readFileSync(file, "utf8")));
    read.push(file);
  }
  return { entries, read };
}

function buildFilter(options: FilterOptions, nowMs: number): LogFilter {
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

function parseLimit(text: string | undefined, fallback: number): number {
  if (text === undefined) return fallback;
  const limit = Number(text);
  if (!Number.isInteger(limit) || limit < 1) throw usageError(`--limit takes a whole number above 0, not "${text}".`);
  return limit;
}

const result = (output: string, exitCode = 0): CommandResult => ({ output, exitCode });

function linesCommand(entries: LogEntry[], limit: number, json: boolean): CommandResult {
  const shown = entries.slice(-limit);
  if (json) return result(JSON.stringify(shown, null, 2));
  if (shown.length === 0) return result("No lines match.");
  return result([`${shown.length} of ${entries.length} matching lines`, ...shown.map(formatEntry)].join("\n"));
}

function errorsCommand(entries: LogEntry[], limit: number, json: boolean): CommandResult {
  const problems = entries.filter(isProblem);
  const groups = summarizeErrors(problems);
  if (json) return result(JSON.stringify({ groups, lines: problems.slice(-limit) }, null, 2));
  if (problems.length === 0) return result("No warnings, errors or 5xx requests.");
  const table = formatTable(
    ["COUNT", "EVENT", "ERROR", "LAST REQUEST"],
    groups.map((group) => [group.count, group.event, group.errorName, group.lastRequestId ?? "-"]),
  );
  return result([table, "", ...problems.slice(-limit).map(formatEntry)].join("\n"));
}

function requestCommand(entries: LogEntry[], requestId: string | undefined, json: boolean): CommandResult {
  if (!requestId) throw usageError("request takes a request id: pnpm run logs:query request <id>.");
  const timeline = requestTimeline(entries, requestId);
  if (json) return result(JSON.stringify(timeline, null, 2));
  if (timeline.length === 0) return result(`No lines have a request id starting with ${requestId}.`, 1);
  const lines = timeline.map(({ offsetMs, entry }) => `${offsetMs === undefined ? "    ?" : `+${offsetMs}ms`.padStart(8)}  ${formatEntry(entry)}`);
  const statements = summarizeStatements(timeline.map(({ entry }) => entry));
  if (statements.length === 0) return result(lines.join("\n"));
  const count = statements.reduce((sum, statement) => sum + statement.count, 0);
  const read = statements.reduce((sum, statement) => sum + statement.rowsRead, 0);
  const written = statements.reduce((sum, statement) => sum + statement.rowsWritten, 0);
  return result([...lines, "", `D1: ${count} statements, ${read} rows read, ${written} rows written`].join("\n"));
}

function routesCommand(entries: LogEntry[], rowsRead: Map<string, number>, limit: number, json: boolean): CommandResult {
  const routes = summarizeRoutes(requestRecords(entries), rowsRead).slice(0, limit);
  if (json) return result(JSON.stringify(routes, null, 2));
  if (routes.length === 0) return result("No requests match.");
  const profiled = routes.some((route) => route.maxRowsRead !== undefined);
  return result(
    formatTable(
      ["ROUTE", "KIND", "COUNT", "4XX", "5XX", "P50", "P95", "MAX", ...(profiled ? ["ROWS P95", "ROWS MAX"] : [])],
      routes.map((route) => [
        route.route,
        route.kind,
        route.count,
        route.clientErrors,
        route.serverErrors,
        milliseconds(route.p50Ms),
        milliseconds(route.p95Ms),
        milliseconds(route.maxMs),
        ...(profiled ? [route.p95RowsRead ?? "-", route.maxRowsRead ?? "-"] : []),
      ]),
    ),
  );
}

function slowCommand(entries: LogEntry[], limit: number, json: boolean): CommandResult {
  const slowest = slowestRequests(requestRecords(entries), limit);
  if (json) return result(JSON.stringify(slowest, null, 2));
  if (slowest.length === 0) return result("No requests match.");
  return result(
    formatTable(
      ["DURATION", "STATUS", "METHOD", "ROUTE", "REQUEST", "LINE"],
      slowest.map((record) => [
        milliseconds(record.durationMs),
        record.status,
        record.method,
        normalizeRoute(record.path),
        record.requestId ?? "-",
        record.lineNumber,
      ]),
    ),
  );
}

function d1Command(entries: LogEntry[], limit: number, json: boolean): CommandResult {
  const statements = summarizeStatements(entries).slice(0, limit);
  if (json) return result(JSON.stringify(statements, null, 2));
  if (statements.length === 0) {
    return result("No d1_query lines. Add D1_PROFILE=true to .dev.vars without printing the file, restart pnpm run dev:all, and repeat the requests.");
  }
  return result(
    formatTable(
      ["ROWS READ", "ROWS WRITTEN", "COUNT", "MAX READ", "TIME", "STATEMENT"],
      statements.map((statement) => [
        statement.rowsRead,
        statement.rowsWritten,
        statement.count,
        statement.maxRowsRead,
        milliseconds(statement.totalMs),
        statement.statement.slice(0, 140),
      ]),
    ),
  );
}

export function runLogQuery(argv: string[], nowMs: number): CommandResult {
  const args = argv[0] === "--" ? argv.slice(1) : argv;
  try {
    let parsed;
    try {
      parsed = parseArgs({ args, allowPositionals: true, options: optionSpec });
    } catch (error) {
      throw usageError(error instanceof Error ? error.message : String(error));
    }
    const { values: options, positionals } = parsed;
    if (options.help) return result(usage);
    const [commandName = "lines", requestArgument] = positionals;
    const command = commands.find((name) => name === commandName);
    if (!command) throw usageError(`Unknown command "${commandName}".`);
    const filter = buildFilter(options, nowMs);
    const json = options.json ?? false;
    const { entries } = readLogFiles(options.file ?? [defaultLogFile]);
    const requestId = requestArgument ?? options.request;
    const matching = entries.filter((entry) => matchesFilter(entry, command === "request" ? { ...filter, requestId: undefined } : filter));
    const tableLimit = parseLimit(options.limit, 20);
    const lineLimit = parseLimit(options.limit, 50);
    const run: Record<CommandName, () => CommandResult> = {
      lines: () => linesCommand(matching, lineLimit, json),
      errors: () => errorsCommand(matching, lineLimit, json),
      request: () => requestCommand(matching, requestId, json),
      routes: () => routesCommand(matching, rowsReadByRequest(entries), tableLimit, json),
      slow: () => slowCommand(matching, tableLimit, json),
      d1: () => d1Command(matching, tableLimit, json),
    };
    return run[command]();
  } catch (error) {
    if (error instanceof QueryError) return result(error.showUsage ? `${error.message}\n\n${usage}` : error.message, error.exitCode);
    throw error;
  }
}
