import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

const SRC = path.resolve(__dirname, '../../../src');
const COPY_HELPER_THAT_NEVER_THROWS = path.join(SRC, 'lib', 'clipboard.ts');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });

describe('clipboard access', () => {
  it('goes through copyTextToClipboard everywhere in src/, since a direct navigator.clipboard call can reject and lose the copy', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== COPY_HELPER_THAT_NEVER_THROWS)
      .filter((file) => /\bnavigator\.clipboard\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });
});
