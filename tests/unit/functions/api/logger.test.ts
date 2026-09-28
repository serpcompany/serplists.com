import { afterEach, describe, expect, it, vi } from 'vitest';
import { log } from '@functions/api/utils/logger';

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  function capture(level: 'info' | 'warn' | 'error' | 'debug') {
    const lines: string[] = [];
    vi.spyOn(console, level).mockImplementation((line: unknown) => {
      lines.push(String(line));
    });
    return lines;
  }

  it('writes structured JSON with the event name and fields', () => {
    const lines = capture('info');

    log('info', 'api_request', { requestId: 'req-1', status: 200 });

    expect(JSON.parse(lines[0])).toMatchObject({ level: 'info', message: 'api_request', requestId: 'req-1', status: 200 });
  });

  it('redacts personal data and secrets whatever the key casing', () => {
    const lines = capture('warn');

    log('warn', 'something', {
      userId: 'user-1',
      ip: '203.0.113.5',
      Email: 'alice@example.com',
      password: 'hunter2hunter2',
      token: 'SECRET',
      Authorization: 'Bearer SECRET',
      cookie: 'better-auth.session_token=SECRET',
    });

    const line = lines[0];
    for (const secret of ['203.0.113.5', 'alice@example.com', 'hunter2hunter2', 'SECRET']) {
      expect(line).not.toContain(secret);
    }
    expect(JSON.parse(line)).toMatchObject({ userId: 'user-1', ip: '[redacted]', Email: '[redacted]' });
  });

  it('never lets a field overwrite the level, event name or timestamp', () => {
    const lines = capture('error');

    log('error', 'env_validation_error', { message: 'bad FRONTEND_URL', level: 'info', timestamp: 'x' });

    expect(JSON.parse(lines[0])).toMatchObject({ level: 'error', message: 'env_validation_error' });
    expect(JSON.parse(lines[0]).timestamp).not.toBe('x');
  });
});
