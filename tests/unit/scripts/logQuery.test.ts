import { mkdirSync, mkdtempSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { parseLogText, requestRecords } from '../../../scripts/lib/logEntries';
import { runLogQuery } from '../../../scripts/lib/logQueryCommand';
import {
  emptyFilter,
  matchesFilter,
  normalizeRoute,
  parsePathPattern,
  parseSince,
  parseStatusRange,
  percentile,
  requestTimeline,
  rowsReadByRequest,
  summarizeErrors,
  summarizeRoutes,
  summarizeStatements,
} from '../../../scripts/lib/logQueries';

const apiLine = (fields: Record<string, unknown>) =>
  JSON.stringify({ level: 'info', timestamp: '2026-09-30T18:58:38.000Z', ...fields });

const apiRequest = (requestId: string, method: string, apiPath: string, status: number, durationMs: number, timestamp: string) =>
  apiLine({ message: 'api_request', requestId, method, path: apiPath, status, durationMs, timestamp });

const sampleLog = [
  '> next dev --port 3000',
  apiRequest('req-a', 'GET', 'templates/0b2c9d1e-1111-4a2b-8c3d-123456789abc', 200, 120, '2026-09-30T18:58:38.100Z'),
  ' GET /api/templates/0b2c9d1e-1111-4a2b-8c3d-123456789abc 200 in 130ms (next.js: 10ms, application-code: 120ms)',
  ' GET /dashboard 200 in 2.3s (next.js: 300ms, application-code: 2s)',
  apiLine({ level: 'error', message: 'api_error', requestId: 'req-b', errorName: 'TypeError', errorMessage: 'x is undefined', timestamp: '2026-09-30T18:58:39.000Z' }),
  apiRequest('req-b', 'POST', 'templates', 500, 45, '2026-09-30T18:58:39.010Z'),
  apiLine({ message: 'd1_query', requestId: 'req-a', sql: "SELECT * FROM templates WHERE id = 'a' LIMIT 20", rowsRead: 40, rowsWritten: 0, rowsReturned: 20, durationMs: 3 }),
  apiLine({ message: 'd1_query', requestId: 'req-a', sql: "SELECT * FROM templates  WHERE id = 'b' LIMIT 20", rowsRead: 60, rowsWritten: 0, rowsReturned: 20, durationMs: 5 }),
].join('\n');

const workDir = mkdtempSync(path.join(tmpdir(), 'log-query-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const writeLog = (name: string, text: string) => {
  const file = path.join(workDir, name);
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
  return file;
};

describe('parseLogText', () => {
  it("reads the API's JSON lines into level, event, request id, timestamp and fields", () => {
    const [entry] = parseLogText(apiRequest('req-a', 'GET', 'teams', 200, 12, '2026-09-30T18:58:38.100Z'));

    expect(entry).toMatchObject({
      source: 'api',
      level: 'info',
      event: 'api_request',
      requestId: 'req-a',
      timestamp: '2026-09-30T18:58:38.100Z',
      fields: { method: 'GET', path: 'teams', status: 200, durationMs: 12 },
      lineNumber: 1,
    });
  });

  it('finds a JSON line behind a prefix and color codes, as wrangler and terminals write them', () => {
    const entries = parseLogText(`[wrangler:info] \u001b[32m${apiLine({ message: 'mcp_tool_call', tool: 'get_run' })}\u001b[39m`);

    expect(entries.map((entry) => entry.event)).toEqual(['mcp_tool_call']);
  });

  it("reads Next.js's page lines, in milliseconds, and dates them by the line before", () => {
    const entries = parseLogText(sampleLog);
    const page = entries.find((entry) => entry.fields.path === '/dashboard');

    expect(page).toMatchObject({
      source: 'next',
      event: 'next_request',
      timestamp: '2026-09-30T18:58:38.100Z',
      fields: { method: 'GET', status: 200, durationMs: 2300, nextJsMs: 300, applicationCodeMs: 2000 },
    });
  });

  it('skips output that is not a log line, including JSON without a level and event', () => {
    const entries = parseLogText(['ready in 2.1s', '{"compiled":true}', '{ not json', apiLine({ message: 'health' })].join('\n'));

    expect(entries.map((entry) => entry.event)).toEqual(['health']);
  });
});

describe('requestRecords', () => {
  it("counts an API request once, from its api_request line, and pages from Next.js's lines", () => {
    const records = requestRecords(parseLogText(sampleLog));

    expect(records.map((record) => `${record.kind} ${record.method} ${record.path}`)).toEqual([
      'api GET /api/templates/0b2c9d1e-1111-4a2b-8c3d-123456789abc',
      'page GET /dashboard',
      'api POST /api/templates',
    ]);
  });
});

describe('normalizeRoute', () => {
  it('groups requests by route by turning ids into :id and keeping words and :token', () => {
    expect(normalizeRoute('/api/templates/0b2c9d1e-1111-4a2b-8c3d-123456789abc/runs/42')).toBe('/api/templates/:id/runs/:id');
    expect(normalizeRoute('/api/checklists/shared/:token')).toBe('/api/checklists/shared/:token');
    expect(normalizeRoute('/api/teams/invites/pending')).toBe('/api/teams/invites/pending');
    expect(normalizeRoute('/api/agent-keys/kAp3xQ9wZ2mR')).toBe('/api/agent-keys/:id');
    expect(normalizeRoute('/templates/seo-launch-checklist?tab=runs')).toBe('/templates/seo-launch-checklist');
  });
});

describe('filters', () => {
  it('reads a status code or a status family', () => {
    expect(parseStatusRange('5xx')).toEqual({ min: 500, max: 599 });
    expect(parseStatusRange('404')).toEqual({ min: 404, max: 404 });
    expect(() => parseStatusRange('9xx')).toThrow('--status');
  });

  it('reads --since as a duration before now or as a date', () => {
    const now = Date.parse('2026-09-30T19:00:00.000Z');

    expect(parseSince('15m', now)).toBe(Date.parse('2026-09-30T18:45:00.000Z'));
    expect(parseSince('2026-09-30T18:00:00Z', now)).toBe(Date.parse('2026-09-30T18:00:00.000Z'));
    expect(() => parseSince('yesterday', now)).toThrow('--since');
  });

  it('matches a path as plain text, or as a /regex/', () => {
    expect(parsePathPattern('teams/invites?x').test('teams/invites?x')).toBe(true);
    expect(parsePathPattern('teams/invites?x').test('teams/invitex')).toBe(false);
    expect(parsePathPattern('/^agent-keys/').test('agent-keys/connection')).toBe(true);
  });

  it('keeps entries that match every option, and drops undated ones from a --since window', () => {
    const entries = parseLogText(sampleLog);
    const since = Date.parse('2026-09-30T18:58:38.500Z');

    expect(entries.filter((entry) => matchesFilter(entry, { ...emptyFilter, where: [{ field: 'errorName', value: 'TypeError' }] })).map((entry) => entry.event)).toEqual([
      'api_error',
    ]);
    expect(entries.filter((entry) => matchesFilter(entry, { ...emptyFilter, status: parseStatusRange('5xx') })).map((entry) => entry.requestId)).toEqual(['req-b']);
    expect(entries.filter((entry) => matchesFilter(entry, { ...emptyFilter, sinceMs: since, sources: ['api'] })).map((entry) => entry.event)).toEqual([
      'api_error',
      'api_request',
    ]);
  });

  it('leaves a page line logged before any dated line out of a --since window', () => {
    const [undated] = parseLogText(' GET /dashboard 200 in 40ms');

    expect(undated?.timestamp).toBeUndefined();
    expect(undated && matchesFilter(undated, { ...emptyFilter, sinceMs: 0 })).toBe(false);
  });
});

describe('summaries', () => {
  it('takes the nearest-rank percentile', () => {
    expect(percentile([5, 1, 4, 2, 3], 0.5)).toBe(3);
    expect(percentile([5, 1, 4, 2, 3], 0.95)).toBe(5);
    expect(percentile([], 0.5)).toBe(0);
  });

  it('counts requests, client and server errors, and latency per route, slowest p95 first', () => {
    const records = requestRecords(
      parseLogText(
        [
          apiRequest('a', 'GET', 'teams/7f3e2a10', 200, 100, '2026-09-30T18:00:00.000Z'),
          apiRequest('b', 'GET', 'teams/9d8c7b60', 404, 300, '2026-09-30T18:00:01.000Z'),
          apiRequest('c', 'GET', 'health', 503, 900, '2026-09-30T18:00:02.000Z'),
        ].join('\n'),
      ),
    );

    expect(summarizeRoutes(records)).toEqual([
      { route: 'GET /api/health', kind: 'api', count: 1, clientErrors: 0, serverErrors: 1, p50Ms: 900, p95Ms: 900, maxMs: 900 },
      { route: 'GET /api/teams/:id', kind: 'api', count: 2, clientErrors: 1, serverErrors: 0, p50Ms: 100, p95Ms: 300, maxMs: 300 },
    ]);
  });

  it('adds up the rows each request read, per route, when D1 profiling tags its statements with the request id', () => {
    const entries = parseLogText(sampleLog);

    const templateRoute = summarizeRoutes(requestRecords(entries), rowsReadByRequest(entries)).find(
      (route) => route.route === 'GET /api/templates/:id',
    );

    expect(templateRoute).toMatchObject({ p95RowsRead: 100, maxRowsRead: 100 });
  });

  it("lays out one request's lines in time order with offsets from its first line", () => {
    const timeline = requestTimeline(parseLogText(sampleLog), 'req-b');

    expect(timeline.map((row) => `${row.offsetMs} ${row.entry.event}`)).toEqual(['0 api_error', '10 api_request']);
  });

  it('adds up D1 statements that differ only in literals and spacing', () => {
    expect(summarizeStatements(parseLogText(sampleLog))).toEqual([
      { statement: 'SELECT * FROM templates WHERE id = ? LIMIT ?', count: 2, rowsRead: 100, rowsWritten: 0, maxRowsRead: 60, totalMs: 8 },
    ]);
  });

  it('groups warnings, errors and 5xx requests by event and error', () => {
    expect(summarizeErrors(parseLogText(sampleLog))).toEqual([
      { event: 'api_error', errorName: 'TypeError', count: 1, lastRequestId: 'req-b' },
      { event: 'api_request', errorName: '500', count: 1, lastRequestId: 'req-b' },
    ]);
  });
});

describe('runLogQuery', () => {
  const now = Date.parse('2026-09-30T19:00:00.000Z');
  const sample = writeLog('dev-all.log', sampleLog);

  it('prints a route table, and ignores the -- that pnpm passes through', () => {
    const { output, exitCode } = runLogQuery(['--', 'routes', '--file', sample], now);

    expect(exitCode).toBe(0);
    expect(output.split('\n')[0]).toMatch(/^ROUTE\s+KIND\s+COUNT\s+4XX\s+5XX\s+P50\s+P95\s+MAX\b/);
    expect(output).toContain('GET /dashboard');
  });

  it('adds rows-read columns to the route table when the log has D1 statements for its requests', () => {
    const { output } = runLogQuery(['routes', '--file', sample], now);

    expect(output.split('\n')[0]).toMatch(/P95\s+MAX\s+ROWS P95\s+ROWS MAX$/);
    expect(output).toMatch(/GET \/api\/templates\/:id\s+api\s+1\s+0\s+0\s+120ms\s+120ms\s+120ms\s+100\s+100/);
  });

  it("prints a request's timeline with its D1 totals, and fails for an id no line has", () => {
    expect(runLogQuery(['request', 'req-a', '--file', sample], now).output).toContain('D1: 2 statements, 100 rows read, 0 rows written');
    expect(runLogQuery(['request', 'req-b', '--file', sample], now).output).toContain('+10ms');
    expect(runLogQuery(['request', 'missing', '--file', sample], now)).toMatchObject({ exitCode: 1 });
  });

  it('prints JSON that parses, for scripts and agents', () => {
    const { output } = runLogQuery(['slow', '--json', '--limit', '1', '--file', sample], now);

    expect(JSON.parse(output)).toEqual([expect.objectContaining({ kind: 'page', path: '/dashboard', durationMs: 2300 })]);
  });

  it('reads the newest .log file in a folder', () => {
    const older = writeLog('folder/older.log', apiLine({ message: 'older_event' }));
    const newer = writeLog('folder/newer.log', apiLine({ message: 'newer_event' }));
    utimesSync(older, new Date('2026-09-30T10:00:00Z'), new Date('2026-09-30T10:00:00Z'));
    utimesSync(newer, new Date('2026-09-30T11:00:00Z'), new Date('2026-09-30T11:00:00Z'));

    const { output } = runLogQuery(['--file', path.dirname(newer)], now);

    expect(output).toContain('newer_event');
    expect(output).not.toContain('older_event');
  });

  it('fails with the usage for a bad option, and without it for a missing file', () => {
    const badOption = runLogQuery(['lines', '--level', 'loud', '--file', sample], now);
    const missing = runLogQuery(['--file', path.join(workDir, 'none.log')], now);

    expect(badOption.exitCode).toBe(2);
    expect(badOption.output).toContain('Usage: pnpm run logs:query');
    expect(missing).toEqual({ output: `No log at ${path.join(workDir, 'none.log')}.`, exitCode: 1 });
  });
});
