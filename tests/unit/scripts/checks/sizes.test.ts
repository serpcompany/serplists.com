import { describe, expect, it } from 'vitest';

import { located } from '../../../../scripts/checks/problems';
import { checkSizes, type SizeException } from '../../../../scripts/checks/sizes';
import { scratchFolder, writeFiles } from './scratch';

const code = (lines: number) => 'export const value = 1;\n'.repeat(lines);

function sizesIn(
  files: Readonly<Record<string, string>>,
  { known = {}, prefixes = [] }: { known?: Readonly<Record<string, SizeException>>; prefixes?: string[] } = {},
) {
  const root = scratchFolder('sizes');
  writeFiles(root, files);
  const checked = Object.keys(files).filter((file) => prefixes.length === 0 || prefixes.includes(file));
  return checkSizes({ root, files: checked, prefixes }, known).map(located);
}

describe('the size check', () => {
  it('passes a code file of 500 lines and fails one of 501, the final newline aside', () => {
    expect(sizesIn({ 'src/fits.ts': code(500), 'src/fits-without-a-final-newline.ts': code(500).trimEnd() })).toEqual([]);
    expect(sizesIn({ 'src/long.ts': code(501) })).toEqual(['src/long.ts  has 501 lines, over the limit of 500']);
  });

  it('counts blank lines too, in every JavaScript and TypeScript extension', () => {
    expect(sizesIn({ 'tools/long.mjs': '\n'.repeat(501), 'src/long.tsx': `${code(250)}\n`.repeat(2) })).toEqual([
      'tools/long.mjs  has 501 lines, over the limit of 500',
      'src/long.tsx  has 502 lines, over the limit of 500',
    ]);
  });

  it('leaves docs, data and the files a generator writes alone', () => {
    expect(sizesIn({ 'docs/long.md': code(900), 'data.json': code(900), 'cloudflare-env.d.ts': code(900) })).toEqual([]);
  });

  it('holds a known large file to its size, which only shrinks', () => {
    const known = { 'src/big.ts': { lines: 600, reason: 'a test' } };
    expect(sizesIn({ 'src/big.ts': code(600) }, { known })).toEqual([]);
    expect(sizesIn({ 'src/big.ts': code(601) }, { known })).toEqual(['src/big.ts  grew to 601 lines, over its recorded 600: split it instead']);
    expect(sizesIn({ 'src/big.ts': code(550) }, { known })).toEqual(['src/big.ts  is down to 550 lines: lower its entry in knownLargeFiles to 550']);
    expect(sizesIn({ 'src/big.ts': code(400) }, { known })).toEqual(['src/big.ts  is down to 400 lines: remove it from knownLargeFiles']);
  });

  it('refuses an exception without a reason', () => {
    expect(sizesIn({ 'src/big.ts': code(600) }, { known: { 'src/big.ts': { lines: 600, reason: ' ' } } })).toEqual([
      'src/big.ts  is excepted from the limit without a reason: give it one, or split the file',
    ]);
  });

  it('asks to drop an exception whose file is gone, unless the run checks other paths', () => {
    const known = { 'src/gone.ts': { lines: 900, reason: 'a test' } };
    expect(sizesIn({ 'src/a.ts': code(1) }, { known })).toEqual(['src/gone.ts  no longer exists: remove it from knownLargeFiles']);
    expect(sizesIn({ 'src/a.ts': code(1) }, { known, prefixes: ['src/a.ts'] })).toEqual([]);
  });
});
