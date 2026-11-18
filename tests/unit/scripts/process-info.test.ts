import { ChildProcess } from 'node:child_process';
import { describe, expect, it } from 'vitest';

import {
  currentProcessStartedAt,
  parsePsProcessInfo,
  parseWindowsProcessInfo,
  readProcessInfo,
  type RunCommand,
} from '../../../scripts/lib/process-info';

describe('parseWindowsProcessInfo', () => {
  it('reads the PowerShell JSON', () => {
    expect(parseWindowsProcessInfo('{"startedAt":1790599283202,"commandLine":"node --import tsx scripts/dev-auto.ts all"}\r\n')).toEqual({
      startedAt: 1790599283202,
      commandLine: 'node --import tsx scripts/dev-auto.ts all',
    });
    expect(parseWindowsProcessInfo('{"startedAt":1790599283202,"commandLine":null}')).toEqual({
      startedAt: 1790599283202,
      commandLine: null,
    });
  });

  it('returns null for a missing process or unexpected output', () => {
    expect(parseWindowsProcessInfo('')).toBeNull();
    expect(parseWindowsProcessInfo('Get-CimInstance : Access denied')).toBeNull();
    expect(parseWindowsProcessInfo('{"startedAt":"yesterday","commandLine":"node"}')).toBeNull();
  });
});

describe('parsePsProcessInfo', () => {
  it('reads the start time and command line', () => {
    expect(parsePsProcessInfo('Mon Sep  8 06:30:00 2026 node --import tsx scripts/dev-auto.ts all\n')).toEqual({
      startedAt: new Date(2026, 8, 8, 6, 30, 0).getTime(),
      commandLine: 'node --import tsx scripts/dev-auto.ts all',
    });
  });

  it('returns null for unexpected output', () => {
    expect(parsePsProcessInfo('')).toBeNull();
    expect(parsePsProcessInfo('error: process ID list syntax error')).toBeNull();
  });
});

describe('readProcessInfo', { timeout: 30_000 }, () => {
  it('reads this process from the operating system', async () => {
    const info = await readProcessInfo(process.pid);

    expect(info).not.toBeNull();
    expect(Math.abs((info?.startedAt ?? 0) - currentProcessStartedAt())).toBeLessThan(5_000);
    expect(typeof info?.commandLine).toBe('string');
  });

  it('returns null for an invalid pid or a failed query', async () => {
    expect(await readProcessInfo(0)).toBeNull();
    const failedQuery = () =>
      Object.assign(Promise.reject(new Error('powershell.exe not found')), { child: new ChildProcess() });

    expect(await readProcessInfo(1234, { run: failedQuery })).toBeNull();
  });
});

describe('readProcessInfo on each operating system', () => {
  type Query = { file: string; args: readonly string[]; env: NodeJS.ProcessEnv | undefined };

  const answering = (stdout: string, queries: Query[]): RunCommand => (file, args, options) => {
    queries.push({ file, args, env: options.env });
    return Promise.resolve({ stdout });
  };

  it('asks ps for the start time and command line in the C locale, outside Windows', async () => {
    const queries: Query[] = [];
    const info = await readProcessInfo(4321, {
      platform: 'linux',
      run: answering('Mon Sep  8 06:30:00 2026 node scripts/dev-auto.ts all\n', queries),
    });

    expect(info).toEqual({ startedAt: new Date(2026, 8, 8, 6, 30, 0).getTime(), commandLine: 'node scripts/dev-auto.ts all' });
    expect(queries.map(({ file, args, env }) => ({ file, args, locale: env?.['LC_ALL'] }))).toEqual([
      { file: 'ps', args: ['-o', 'lstart=', '-o', 'args=', '-p', '4321'], locale: 'C' },
    ]);
  });

  it('asks PowerShell for the process with that id on Windows', async () => {
    const queries: Query[] = [];
    const info = await readProcessInfo(4321, {
      platform: 'win32',
      run: answering('{"startedAt":1790599283202,"commandLine":"node"}', queries),
    });

    expect(info).toEqual({ startedAt: 1790599283202, commandLine: 'node' });
    expect(queries[0]?.file).toBe('powershell.exe');
    expect(queries[0]?.args.at(-1)).toContain('Get-CimInstance Win32_Process -Filter "ProcessId=4321"');
  });

  it('reads no process from no output or a start time that is not a date', () => {
    expect(parseWindowsProcessInfo(undefined)).toBeNull();
    expect(parsePsProcessInfo(undefined)).toBeNull();
    expect(parsePsProcessInfo('Mon Abc  8 06:30:00 2026 node')).toBeNull();
  });
});
