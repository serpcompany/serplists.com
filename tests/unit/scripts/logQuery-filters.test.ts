import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';

import { parseLogText, requestRecords } from '../../../scripts/lib/logEntries';
import { runLogQuery } from '../../../scripts/lib/logQueryCommand';
import {
  emptyFilter,
  matchesFilter,
  normalizeRoute,
  parsePathPattern,
  requestTimeline,
  summarizeErrors,
  summarizeRoutes,
  summarizeStatements,
  type LogFilter,
} from '../../../scripts/lib/logQueries';
import { apiLine, apiRequest } from '../../fixtures/apiLogLines';

const log = parseLogText(
  [
    apiRequest('req-ok', 'GET', 'teams', 200, 20, '2026-09-30T18:58:38.000Z'),
    apiLine({ level: 'warn', message: 'rate_limited', requestId: 'req-warn', path: 'auth/sign-in' }),
    apiLine({ level: 'error', message: 'api_error', requestId: 'req-err', errorName: 'TypeError' }),
    apiLine({ level: 'error', message: 'api_error', errorName: 'TypeError' }),
    ' GET /dashboard 200 in 80ms',
  ].join('\n'),
);

const eventsMatching = (filter: Partial<LogFilter>) =>
  log.filter((entry) => matchesFilter(entry, { ...emptyFilter, ...filter })).map((entry) => `${entry.event} ${entry.requestId ?? '-'}`);

describe('logs:query filters', () => {
  it('keeps only the levels and events asked for', () => {
    expect(eventsMatching({ levels: ['warn'] })).toEqual(['rate_limited req-warn']);
    expect(eventsMatching({ events: ['api_request', 'rate_limited'] })).toEqual(['api_request req-ok', 'rate_limited req-warn']);
  });

  it('matches a request id by its start, and leaves out the lines that have none', () => {
    expect(eventsMatching({ requestId: 'req-' })).toEqual(['api_request req-ok', 'rate_limited req-warn', 'api_error req-err']);
  });

  it('matches a path against the lines that have one, and leaves out the rest', () => {
    expect(eventsMatching({ pathPattern: parsePathPattern('/^(auth|[/]dash)/') })).toEqual(['rate_limited req-warn', 'next_request -']);
  });

  it('turns a mixed-case segment of ten letters or more into :id, and keeps a shorter one', () => {
    expect(normalizeRoute('/api/runs/AbCdEfGhIj')).toBe('/api/runs/:id');
    expect(normalizeRoute('/api/runs/AbCdEf')).toBe('/api/runs/AbCdEf');
  });
});

describe('logs:query summaries of lines it cannot fully read', () => {
  it("leaves an api_request line without a method, status or duration out of the requests, and a d1_query line without its counts out of the statements", () => {
    const entries = parseLogText(
      [
        apiLine({ message: 'api_request', requestId: 'req-x', path: 'teams' }),
        apiLine({ message: 'd1_query', requestId: 'req-x', sql: 'SELECT 1' }),
      ].join('\n'),
    );

    expect(requestRecords(entries)).toEqual([]);
    expect(summarizeStatements(entries)).toEqual([]);
  });

  it('puts the busier of two routes or statements first when they tie', () => {
    const entries = parseLogText(
      [
        apiRequest('a', 'GET', 'health', 200, 50, '2026-09-30T18:00:00.000Z'),
        apiRequest('b', 'GET', 'teams', 200, 50, '2026-09-30T18:00:01.000Z'),
        apiRequest('c', 'GET', 'teams', 200, 50, '2026-09-30T18:00:02.000Z'),
        apiLine({ message: 'd1_query', sql: 'SELECT * FROM a', rowsRead: 4, rowsWritten: 0, durationMs: 1 }),
        apiLine({ message: 'd1_query', sql: 'SELECT * FROM b', rowsRead: 2, rowsWritten: 0, durationMs: 1 }),
        apiLine({ message: 'd1_query', sql: 'SELECT * FROM b', rowsRead: 2, rowsWritten: 0, durationMs: 1 }),
      ].join('\n'),
    );

    expect(summarizeRoutes(requestRecords(entries)).map((route) => `${route.route} ${route.count}`)).toEqual(['GET /api/teams 2', 'GET /api/health 1']);
    expect(summarizeStatements(entries).map((statement) => `${statement.statement} ${statement.count}`)).toEqual([
      'SELECT * FROM b 2',
      'SELECT * FROM a 1',
    ]);
  });

  it('keeps the last request id an error group saw when its latest line has none', () => {
    expect(summarizeErrors(log).find((group) => group.event === 'api_error')).toEqual({
      event: 'api_error',
      errorName: 'TypeError',
      count: 2,
      lastRequestId: 'req-err',
    });
  });

  it("gives no offset to a request's lines logged before any dated line, and keeps them first", () => {
    const entries = parseLogText(
      [
        JSON.stringify({ level: 'info', message: 'mcp_tool_call', requestId: 'req-u' }),
        JSON.stringify({ level: 'info', message: 'mcp_tool_list', requestId: 'req-u' }),
        apiLine({ message: 'api_request', requestId: 'req-u', timestamp: '2026-09-30T18:00:01.000Z' }),
        JSON.stringify({ level: 'info', message: 'mcp_tool_result', requestId: 'req-u' }),
      ].join('\n'),
    );

    expect(requestTimeline(entries, 'req-u').map((row) => `${row.offsetMs} ${row.entry.event}`)).toEqual([
      'undefined mcp_tool_call',
      'undefined mcp_tool_list',
      '0 api_request',
      '0 mcp_tool_result',
    ]);
  });
});

describe('logs:query reading a folder', () => {
  const startedIn = process.cwd();
  let folder = '';

  beforeEach(() => {
    folder = mkdtempSync(path.join(tmpdir(), 'log-query-folder-'));
  });

  afterEach(() => {
    process.chdir(startedIn);
    rmSync(folder, { recursive: true, force: true });
  });

  it('lets an error reading the newest .log entry through, rather than reporting it as a usage problem', () => {
    mkdirSync(path.join(folder, 'dev-all.log'));

    expect(() => runLogQuery(['--file', folder], Date.now())).toThrow(/EISDIR/);
  });

  it("reads dev:all's own log by default, and says how to write it when it is missing", () => {
    process.chdir(folder);

    expect(runLogQuery([], Date.now())).toEqual({
      output: 'No log at tmp/logs/dev-all.log. Start the app with pnpm run dev:all, which writes it, or pass --file <path>.',
      exitCode: 1,
    });
    mkdirSync(path.join('tmp', 'logs'), { recursive: true });
    writeFileSync(path.join('tmp', 'logs', 'dev-all.log'), apiLine({ level: 'error', message: 'api_error', errorName: 'TypeError' }));
    expect(runLogQuery(['errors'], Date.now()).output.split('\n')[1]).toMatch(/^1\s+api_error\s+TypeError\s+-$/);
  });
});
