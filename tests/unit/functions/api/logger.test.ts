import { DrizzleQueryError } from 'drizzle-orm';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { elementAt, firstOf } from '../../../support/elements';
import { describeErrorForLog, log } from '@functions/api/utils/logger';
import { runWithRequestId } from '@functions/api/utils/request-context';
import { jsonRecordIn } from '../../../support/storedJson';

describe('log', () => {
  afterEach(() => vi.restoreAllMocks());

  function capture(level: 'info' | 'warn' | 'error' | 'debug') {
    const lines: string[] = [];
    vi.spyOn(console, level).mockImplementation((...args: unknown[]) => {
      lines.push(String(args[0]));
    });
    return lines;
  }

  it('writes structured JSON with the event name and fields', () => {
    const lines = capture('info');

    log('info', 'api_request', { requestId: 'req-1', status: 200 });

    expect(JSON.parse(firstOf(lines))).toMatchObject({ level: 'info', message: 'api_request', requestId: 'req-1', status: 200 });
  });

  it('tags every line logged while a request is handled with its id, awaits included, so one query finds them all', async () => {
    const lines = capture('info');

    await runWithRequestId('req-ctx', async () => {
      log('info', 'd1_query', { rowsRead: 3 });
      await Promise.resolve();
      log('info', 'mcp_tool_call', { tool: 'get_run' });
    });
    log('info', 'outside_a_request');

    expect(lines.map((line) => jsonRecordIn(line).requestId)).toEqual(['req-ctx', 'req-ctx', undefined]);
  });

  it('keeps a request id passed as a field', () => {
    const lines = capture('info');

    runWithRequestId('req-ctx', () => log('info', 'api_request', { requestId: 'req-explicit' }));

    expect(jsonRecordIn(firstOf(lines)).requestId).toBe('req-explicit');
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

    const line = firstOf(lines);
    for (const secret of ['203.0.113.5', 'alice@example.com', 'hunter2hunter2', 'SECRET']) {
      expect(line).not.toContain(secret);
    }
    expect(JSON.parse(line)).toMatchObject({ userId: 'user-1', ip: '[redacted]', Email: '[redacted]' });
  });

  it('drops Drizzle query parameters from any field, as an error or as its message', () => {
    const lines = capture('error');
    const drizzleError = new DrizzleQueryError(
      'select "id" from "users" where lower("email") = ?',
      ['alice@example.com'],
      new Error('D1_ERROR: overloaded'),
    );

    log('error', 'x', { error: drizzleError });
    log('error', 'x', { error: drizzleError.message });
    log('error', 'x', { reason: `wrapped: ${drizzleError.message}`, userId: 'user-1' });

    for (const line of lines) {
      expect(line).not.toContain('alice@example.com');
      expect(line).not.toContain('params:');
    }
    expect(jsonRecordIn(firstOf(lines)).error).toEqual({ errorName: 'DrizzleQueryError', errorMessage: 'D1_ERROR: overloaded' });
    expect(jsonRecordIn(elementAt(lines, 1)).error).toBe('Failed query: select "id" from "users" where lower("email") = ?');
    expect(JSON.parse(elementAt(lines, 2))).toMatchObject({ userId: 'user-1' });
  });

  it('never lets a field overwrite the level, event name or timestamp', () => {
    const lines = capture('error');

    log('error', 'env_validation_error', { message: 'bad FRONTEND_URL', level: 'info', timestamp: 'x' });

    expect(JSON.parse(firstOf(lines))).toMatchObject({ level: 'error', message: 'env_validation_error' });
    expect(jsonRecordIn(firstOf(lines)).timestamp).not.toBe('x');
  });
});

describe('describeErrorForLog', () => {
  it('logs the database error a Drizzle query error wraps, never its parameters', () => {
    const error = Object.assign(
      new Error('Failed query: update "checklist_runs" set "items" = ?\nparams: {"notes":"call jane@example.com"}'),
      { cause: new Error('D1_ERROR: no such column: retired_items') },
    );

    const described = describeErrorForLog(error);

    expect(described).toEqual({ errorName: 'DrizzleQueryError', errorMessage: 'D1_ERROR: no such column: retired_items' });
    expect(JSON.stringify(described)).not.toContain('jane@example.com');
  });

  it('recognizes a Drizzle query error by its class', () => {
    const error = new DrizzleQueryError('delete from "verification" where "identifier" = ?', ['reset-password:secret']);

    expect(describeErrorForLog(error)).toEqual({ errorName: 'DrizzleQueryError', errorMessage: 'no cause' });
  });

  it('drops a params section from any other error message', () => {
    expect(describeErrorForLog(new TypeError('bad value\nparams: secret'))).toEqual({
      errorName: 'TypeError',
      errorMessage: 'bad value',
    });
  });

  it('bounds long messages and describes thrown non-errors', () => {
    expect(describeErrorForLog(new Error('x'.repeat(1_000))).errorMessage).toHaveLength(301);
    expect(describeErrorForLog('plain failure')).toEqual({ errorName: 'string', errorMessage: 'plain failure' });
  });
});
