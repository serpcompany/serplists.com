import { vi } from 'vitest';

export const DEPLOYED_HOST = 'https://app.example.test';

export const FRESH_ROUTER_IMPORT_TIMEOUT_MS = 30_000;

export function requestFromIp(ip: string, method: string, path: string, host = DEPLOYED_HOST) {
  const sendsABody = method !== 'GET';
  return new Request(`${host}/api/${path}`, {
    method,
    headers: { 'CF-Connecting-IP': ip, ...(sendsABody ? { 'Content-Type': 'application/json' } : {}) },
    ...(sendsABody ? { body: '{}' } : {}),
  });
}

export function silenceRequestLog() {
  vi.spyOn(console, 'info').mockImplementation(() => undefined);
}

export function captureLogLines(levels: ReadonlyArray<'debug' | 'info' | 'warn' | 'error'>): string[] {
  const lines: string[] = [];
  for (const level of levels) {
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(args.map(String).join(' '));
    });
  }
  return lines;
}

export function silenceLogs() {
  captureLogLines(['info', 'warn', 'error']);
}
