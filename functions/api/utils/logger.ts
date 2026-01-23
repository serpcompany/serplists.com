export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export function getClientIp(request: Request): string | null {
  const direct = request.headers.get('CF-Connecting-IP');
  if (direct) return direct;
  const forwarded = request.headers.get('X-Forwarded-For');
  if (!forwarded) return null;
  return forwarded.split(',')[0]?.trim() || null;
}

export function log(level: LogLevel, message: string, data?: Record<string, unknown>) {
  const payload = {
    level,
    message,
    ...data,
    timestamp: new Date().toISOString(),
  };

  const line = JSON.stringify(payload);
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else if (level === 'debug') console.debug(line);
  else console.info(line);
}
