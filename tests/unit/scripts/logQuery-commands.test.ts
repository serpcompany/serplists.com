import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

import { runLogQuery } from '../../../scripts/lib/logQueryCommand';
import { apiLine, apiRequest } from '../../fixtures/apiLogLines';
import { stringContaining, stringMatching } from '../../support/asymmetricMatchers';

const now = Date.parse('2026-09-30T19:00:00.000Z');
const workDir = mkdtempSync(path.join(tmpdir(), 'log-query-commands-'));
afterAll(() => rmSync(workDir, { recursive: true, force: true }));

const logFile = (name: string, lines: string[]) => {
  const file = path.join(workDir, name);
  writeFileSync(file, lines.join('\n'));
  return file;
};

const eventsSchema = z.array(z.object({ event: z.string() }).passthrough());
const jsonOutput = <T>(schema: z.ZodType<T>, args: string[]) => schema.parse(JSON.parse(runLogQuery(args, now).output));

const problemLog = logFile('problems.log', [
  apiRequest('req-ok', 'GET', 'teams', 200, 20, '2026-09-30T18:58:38.000Z'),
  apiLine({ level: 'warn', message: 'rate_limited', requestId: 'req-warn', path: 'auth/sign-in' }),
  apiLine({ level: 'error', message: 'api_error', requestId: 'req-err', errorName: 'TypeError', errorMessage: 'x is undefined' }),
  apiRequest('req-err', 'POST', 'templates', 500, 1500, '2026-09-30T18:58:39.000Z'),
  ' GET /dashboard 200 in 80ms',
]);
const quietLog = logFile('quiet.log', [apiRequest('req-ok', 'GET', 'teams', 200, 20, '2026-09-30T18:58:38.000Z')]);
const d1Log = logFile('d1.log', [
  apiLine({ message: 'd1_query', requestId: 'req-a', sql: 'SELECT * FROM runs WHERE id = 7', rowsRead: 12, rowsWritten: 0, durationMs: 2 }),
  apiLine({ message: 'd1_query', requestId: 'req-a', sql: "UPDATE runs SET name = 'x' WHERE id = 7", rowsRead: 1, rowsWritten: 1, durationMs: 1500 }),
]);

describe('logs:query errors', () => {
  it('groups warnings, errors and 5xx requests, then prints the latest of them', () => {
    const { output, exitCode } = runLogQuery(['errors', '--file', problemLog], now);
    const [header, ...rest] = output.split('\n');

    expect(exitCode).toBe(0);
    expect(header).toMatch(/^COUNT\s+EVENT\s+ERROR\s+LAST REQUEST$/);
    expect(rest.slice(0, 3).map((row) => row.split(/\s+/).join(' '))).toEqual([
      '1 rate_limited req-warn',
      '1 api_error TypeError req-err',
      '1 api_request 500 req-err',
    ]);
    expect(output).toContain('error api_error requestId=req-err errorName=TypeError errorMessage="x is undefined"');
    expect(output).not.toContain('req-ok');
  });

  it('says so when the log has no problems', () => {
    expect(runLogQuery(['errors', '--file', quietLog], now)).toEqual({ output: 'No warnings, errors or 5xx requests.', exitCode: 0 });
  });

  it('prints the groups and the latest lines as JSON', () => {
    const body = jsonOutput(z.object({ groups: eventsSchema, lines: eventsSchema }), ['errors', '--json', '--limit', '1', '--file', problemLog]);

    expect(body.groups.map((group) => group.event)).toEqual(['rate_limited', 'api_error', 'api_request']);
    expect(body.lines.map((line) => line.event)).toEqual(['api_request']);
  });
});

describe('logs:query d1', () => {
  it('lists statements by rows read, with literals folded and the time each took', () => {
    expect(runLogQuery(['d1', '--file', d1Log], now).output.split('\n')).toEqual([
      stringMatching(/^ROWS READ\s+ROWS WRITTEN\s+COUNT\s+MAX READ\s+TIME\s+STATEMENT$/),
      stringMatching(/^12\s+0\s+1\s+12\s+2ms\s+SELECT \* FROM runs WHERE id = \?$/),
      stringMatching(/^1\s+1\s+1\s+1\s+1\.50s\s+UPDATE runs SET name = \? WHERE id = \?$/),
    ]);
  });

  it('tells the developer how to turn profiling on when the log has no statements', () => {
    expect(runLogQuery(['d1', '--file', quietLog], now).output).toContain('Add D1_PROFILE=true to .dev.vars');
  });

  it('prints the statements as JSON', () => {
    const statements = jsonOutput(z.array(z.object({ statement: z.string() }).passthrough()), ['d1', '--json', '--file', d1Log]);

    expect(statements.map((statement) => statement.statement)).toEqual(['SELECT * FROM runs WHERE id = ?', 'UPDATE runs SET name = ? WHERE id = ?']);
  });
});

describe('logs:query slow, routes and request', () => {
  it('lists the slowest requests with their routes and request ids', () => {
    const rows = runLogQuery(['slow', '--file', problemLog], now).output.split('\n');

    expect(rows[0]).toMatch(/^DURATION\s+STATUS\s+METHOD\s+ROUTE\s+REQUEST\s+LINE$/);
    expect(rows[1]).toMatch(/^1\.50s\s+500\s+POST\s+\/api\/templates\s+req-err\s+4$/);
    expect(rows.at(-1)).toMatch(/^20ms\s+200\s+GET\s+\/api\/teams\s+req-ok\s+1$/);
    expect(rows.find((row) => row.includes('/dashboard'))).toMatch(/\/dashboard\s+-\s+5$/);
  });

  it("keeps only Next.js's page lines for --source next", () => {
    expect(runLogQuery(['slow', '--source', 'next', '--file', problemLog], now).output.split('\n')).toEqual([
      stringMatching(/^DURATION\s+STATUS\s+METHOD\s+ROUTE\s+REQUEST\s+LINE$/),
      stringMatching(/^80ms\s+200\s+GET\s+\/dashboard\s+-\s+5$/),
    ]);
  });

  it('says no requests match when the filter leaves none', () => {
    expect(runLogQuery(['slow', '--status', '404', '--file', problemLog], now).output).toBe('No requests match.');
    expect(runLogQuery(['routes', '--status', '404', '--file', problemLog], now).output).toBe('No requests match.');
  });

  it('prints routes as JSON, and leaves out the rows-read columns when nothing was profiled', () => {
    const routes = jsonOutput(z.array(z.object({ route: z.string() }).passthrough()), ['routes', '--json', '--file', problemLog]);

    expect(routes.map((route) => route.route)).toEqual(['POST /api/templates', 'GET /dashboard', 'GET /api/teams']);
    expect(runLogQuery(['routes', '--file', problemLog], now).output.split('\n')[0]).not.toContain('ROWS');
  });

  it('takes the request id from --request, marks lines it cannot date, and prints the timeline as JSON', () => {
    const undated = logFile('undated.log', [JSON.stringify({ level: 'info', message: 'mcp_tool_call', requestId: 'req-u', tool: 'get_run' })]);

    expect(runLogQuery(['request', '--request', 'req-u', '--file', undated], now).output).toBe(
      '    ?  --:--:--     info  mcp_tool_call requestId=req-u tool=get_run',
    );
    const timeline = jsonOutput(z.array(z.object({ offsetMs: z.number() }).passthrough()), ['request', 'req-err', '--json', '--file', problemLog]);
    expect(timeline.map((row) => row.offsetMs)).toEqual([0, 1000]);
  });

  it('prints a timeline without D1 totals when the request ran no statements', () => {
    const { output, exitCode } = runLogQuery(['request', 'req-ok', '--file', problemLog], now);

    expect(exitCode).toBe(0);
    expect(output).not.toContain('D1:');
  });
});

describe('logs:query usage', () => {
  it('prints the usage for --help', () => {
    expect(runLogQuery(['--help'], now)).toEqual({ output: stringContaining('Usage: pnpm run logs:query [command] [options]'), exitCode: 0 });
  });

  it.each([
    ['an unknown command', ['tail'], 'Unknown command "tail".'],
    ['a request without an id', ['request'], 'request takes a request id'],
    ['an unknown option', ['--colour'], "Unknown option '--colour'"],
    ['a limit that is not a whole number', ['--limit', '2.5'], '--limit takes a whole number above 0, not "2.5".'],
    ['an unknown source', ['--source', 'worker'], '--source takes api or next, not "worker".'],
    ['a where without a field', ['--where', '=x'], '--where takes field=value, not "=x".'],
  ])('refuses %s with the usage and exit status 2', (_what, args, message) => {
    const { output, exitCode } = runLogQuery([...args, '--file', quietLog], now);

    expect(exitCode).toBe(2);
    expect(output).toContain(message);
    expect(output).toContain('Usage: pnpm run logs:query');
  });

  it('fails for a folder with no .log file, and points to dev:all when its own log is missing', () => {
    const empty = path.join(workDir, 'empty');
    mkdirSync(empty);

    expect(runLogQuery(['--file', empty], now)).toEqual({ output: `No .log file in ${empty}.`, exitCode: 1 });
    expect(runLogQuery(['--file', 'tmp/logs/never-written/dev-all.log'], now).output).toBe('No log at tmp/logs/never-written/dev-all.log.');
  });
});
