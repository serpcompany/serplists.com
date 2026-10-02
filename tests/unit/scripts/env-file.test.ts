import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import { parseEnvFile, parseEnvText } from '../../../scripts/lib/env-file';

const fixtureRoot = mkdtempSync(path.join(tmpdir(), 'env-file-'));

afterAll(() => {
  rmSync(fixtureRoot, { recursive: true, force: true });
});

describe('parseEnvText', () => {
  it('reads KEY=value lines and skips blank lines, comments and lines without =', () => {
    expect(parseEnvText(['# a comment', '', 'FRONTEND_URL=http://localhost:3000', 'NOT A PAIR', '  # indented comment'].join('\n'))).toEqual({
      FRONTEND_URL: 'http://localhost:3000',
    });
  });

  it('trims the key and the value, so a CRLF checkout reads the same', () => {
    expect(parseEnvText('  D1_PROFILE = true  \r\nLOG_LEVEL=debug\r\n')).toEqual({ D1_PROFILE: 'true', LOG_LEVEL: 'debug' });
  });

  it('strips one quote from each end of the value', () => {
    expect(parseEnvText([`SINGLE='one'`, 'DOUBLE="two"', 'INNER=a"b"c'].join('\n'))).toEqual({
      SINGLE: 'one',
      DOUBLE: 'two',
      INNER: 'a"b"c',
    });
  });

  it('keeps every = after the first in the value, and lets a later line win', () => {
    expect(parseEnvText(['QUERY=a=b=c', 'MODE=first', 'MODE=second', 'EMPTY='].join('\n'))).toEqual({
      QUERY: 'a=b=c',
      MODE: 'second',
      EMPTY: '',
    });
  });
});

describe('parseEnvFile', () => {
  it('reads nothing from a file that does not exist', () => {
    expect(parseEnvFile(path.join(fixtureRoot, 'missing.vars'))).toEqual({});
  });

  it('parses the file as parseEnvText does', () => {
    const file = path.join(fixtureRoot, 'local.vars');
    const contents = '# local values\nSITE_NAME="SERP Lists"\nFRONTEND_URL=http://localhost:3000\n';
    writeFileSync(file, contents);

    expect(parseEnvFile(file)).toEqual(parseEnvText(contents));
    expect(parseEnvFile(file)).toEqual({ SITE_NAME: 'SERP Lists', FRONTEND_URL: 'http://localhost:3000' });
  });
});
