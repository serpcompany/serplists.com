import { DrizzleQueryError } from 'drizzle-orm';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function getClientIp(request: Request): string | null {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct;
  const forwarded = request.headers.get('X-Forwarded-For');
  if (!forwarded) return null;
  return forwarded.split(',')[0]?.trim() || null;
}

// Logs carry ids, never personal data or secrets (core-beliefs.md). A field
// with one of these names is written as '[redacted]', so a new call site cannot
// leak one. Client IPs are personal data too.
const REDACTED_FIELDS = new Set(['ip', 'email', 'password', 'token', 'authorization', 'cookie']);

function redact(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    fields[key] = REDACTED_FIELDS.has(key.toLowerCase()) && value !== undefined ? '[redacted]' : withoutQueryParams(value);
  }
  return fields;
}

// Drizzle appends a failed query's bound values (user content: emails, tokens,
// run notes) to its message after this marker.
const QUERY_PARAMS_MARKER = '\nparams:';

// A backstop for call sites that log an error, or its message, directly: an Error
// is described (JSON would print a DrizzleQueryError's params), and a string loses
// its params section.
function withoutQueryParams(value: unknown): unknown {
  if (value instanceof Error) return describeErrorForLog(value);
  if (typeof value !== 'string') return value;
  const paramsIndex = value.indexOf(QUERY_PARAMS_MARKER);
  return paramsIndex === -1 ? value : value.slice(0, paramsIndex);
}

const MAX_LOGGED_ERROR_LENGTH = 300;

const truncateForLog = (value: string): string =>
  value.length > MAX_LOGGED_ERROR_LENGTH ? `${value.slice(0, MAX_LOGGED_ERROR_LENGTH)}…` : value;

// An error's name and message, safe to log. Drizzle's DrizzleQueryError message is
// "Failed query: <sql>\nparams: <values>", and the values are user content (run notes,
// titles, emails), so log the database error it wraps instead.
export function describeErrorForLog(error: unknown): { errorName: string; errorMessage: string } {
  if (!(error instanceof Error)) {
    return { errorName: typeof error, errorMessage: truncateForLog(String(error)) };
  }

  if (error instanceof DrizzleQueryError || error.message.startsWith('Failed query: ')) {
    const cause = error.cause;
    const causeMessage = cause instanceof Error ? cause.message : cause === undefined ? 'no cause' : String(cause);
    return { errorName: 'DrizzleQueryError', errorMessage: truncateForLog(causeMessage) };
  }

  const paramsIndex = error.message.indexOf(QUERY_PARAMS_MARKER);
  const message = paramsIndex === -1 ? error.message : error.message.slice(0, paramsIndex);
  return { errorName: error.name, errorMessage: truncateForLog(message) };
}

export function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const payload: Record<string, unknown> = {
    level,
    message,
    ...redact(data),
    timestamp: new Date().toISOString(),
  };
  // A field must not replace the level or the event name.
  payload.level = level;
  payload.message = message;

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.info(line);
}
