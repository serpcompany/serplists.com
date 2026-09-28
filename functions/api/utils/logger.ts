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
    fields[key] = REDACTED_FIELDS.has(key.toLowerCase()) && value !== undefined ? '[redacted]' : value;
  }
  return fields;
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
