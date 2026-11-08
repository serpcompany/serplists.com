import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { binOfPackageHolding, outputLines, run } from '../../../../scripts/checks/tools';
import { scratchFolder, writeFiles } from './scratch';

describe('finding a command in a package', () => {
  it('walks up from the file to the package that names the command, past packages that name others', () => {
    const at = scratchFolder('tools');
    writeFiles(at, {
      'package.json': JSON.stringify({ bin: { jscpd: 'bin/jscpd.js' } }),
      'node_modules/inner/package.json': JSON.stringify({ bin: { other: 'other.js' } }),
      'node_modules/inner/lib/index.js': '',
    });

    expect(binOfPackageHolding(path.join(at, 'node_modules', 'inner', 'lib', 'index.js'), 'jscpd')).toBe(path.join(at, 'bin', 'jscpd.js'));
  });

  it('says no package holds the command when none above the file names it', () => {
    const at = scratchFolder('tools');
    writeFiles(at, { 'lib/index.js': '', 'package.json': JSON.stringify({ name: 'no-bins' }) });
    const file = path.join(at, 'lib', 'index.js');

    expect(() => binOfPackageHolding(file, 'serplists-no-such-command')).toThrow(
      `No package above ${file} has a serplists-no-such-command command in its package.json bin.`,
    );
  });
});

describe('running a check tool', () => {
  it('marks a command that is not installed as missing', () => {
    expect(run('serplists-no-such-command', [], { cwd: process.cwd() })).toEqual({ status: null, output: '', missing: true });
  });

  it('splits output into lines without trailing spaces or blank lines', () => {
    expect(outputLines('first  \r\n\nsecond\n')).toEqual(['first', 'second']);
  });
});
