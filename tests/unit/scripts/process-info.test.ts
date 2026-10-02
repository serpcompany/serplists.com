import { describe, expect, it } from 'vitest';

import {
  currentProcessStartedAt,
  parsePsProcessInfo,
  parseWindowsProcessInfo,
  readProcessInfo,
} from '../../../scripts/lib/process-info.mjs';

describe('parseWindowsProcessInfo', () => {
  it('reads the PowerShell JSON', () => {
    expect(parseWindowsProcessInfo('{"startedAt":1790599283202,"commandLine":"node scripts/dev-auto.mjs all"}\r\n')).toEqual({
      startedAt: 1790599283202,
      commandLine: 'node scripts/dev-auto.mjs all',
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
    expect(parsePsProcessInfo('Mon Sep  8 06:30:00 2026 node scripts/dev-auto.mjs all\n')).toEqual({
      startedAt: new Date(2026, 8, 8, 6, 30, 0).getTime(),
      commandLine: 'node scripts/dev-auto.mjs all',
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
    expect(
      await readProcessInfo(1234, {
        run: async () => {
          throw new Error('powershell.exe not found');
        },
      }),
    ).toBeNull();
  });
});
