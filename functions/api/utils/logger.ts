import { DrizzleQueryError } from 'drizzle-orm';

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function getClientIp(request: Request): string | null {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct;
  const forwarded = request.headers.get('X-Forwarded-For');
  if (!forwarded) return null;
  return forwarded.split(',')[0]?.trim() || null;
}

const FIELDS_LOGGED_AS_REDACTED = new Set(['ip', 'email', 'password', 'token', 'authorization', 'cookie']);

function redact(data: Record<string, unknown> | undefined): Record<string, unknown> {
  const fields: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(data ?? {})) {
    fields[key] = FIELDS_LOGGED_AS_REDACTED.has(key.toLowerCase()) && value !== undefined ? '[redacted]' : withoutQueryParams(value);
  }
  return fields;
}

const DRIZZLE_QUERY_PARAMS_MARKER = '\nparams:';
const DRIZZLE_FAILED_QUERY_PREFIX = 'Failed query: ';

function withoutQueryParams(value: unknown): unknown {
  if (value instanceof Error) return describeErrorForLog(value);
  if (typeof value !== 'string') return value;
  const paramsIndex = value.indexOf(DRIZZLE_QUERY_PARAMS_MARKER);
  return paramsIndex === -1 ? value : value.slice(0, paramsIndex);
}

const MAX_LOGGED_ERROR_LENGTH = 300;

const truncateForLog = (value: string): string =>
  value.length > MAX_LOGGED_ERROR_LENGTH ? `${value.slice(0, MAX_LOGGED_ERROR_LENGTH)}…` : value;

const isDrizzleQueryError = (error: Error): boolean =>
  error instanceof DrizzleQueryError || error.message.startsWith(DRIZZLE_FAILED_QUERY_PREFIX);

export function describeErrorForLog(error: unknown): { errorName: string; errorMessage: string } {
  if (!(error instanceof Error)) {
    return { errorName: typeof error, errorMessage: truncateForLog(String(error)) };
  }

  if (isDrizzleQueryError(error)) {
    const cause = error.cause;
    const causeMessage = cause instanceof Error ? cause.message : cause === undefined ? 'no cause' : String(cause);
    return { errorName: 'DrizzleQueryError', errorMessage: truncateForLog(causeMessage) };
  }

  const paramsIndex = error.message.indexOf(DRIZZLE_QUERY_PARAMS_MARKER);
  const message = paramsIndex === -1 ? error.message : error.message.slice(0, paramsIndex);
  return { errorName: error.name, errorMessage: truncateForLog(message) };
}

export function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const { level: _fieldNamedLevel, message: _fieldNamedMessage, ...fields } = redact(data);
  const line = JSON.stringify({ level, message, ...fields, timestamp: new Date().toISOString() });
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.info(line);
}
