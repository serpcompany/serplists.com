import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

// A direct navigator.clipboard call can reject (Safari after a network request, denied
// permission, lost focus) and lose what it was copying. Every copy goes through
// copyTextToClipboard, which never throws; ESLint enforces the same rule.
const SRC = path.resolve(__dirname, '../../../src');
const ALLOWED = path.join(SRC, 'lib', 'clipboard.ts');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(name) ? [full] : [];
  });

describe('clipboard access', () => {
  it('goes through copyTextToClipboard everywhere in src/', () => {
    const offenders = sourceFiles(SRC)
      .filter((file) => file !== ALLOWED)
      .filter((file) => /\bnavigator\.clipboard\b/.test(readFileSync(file, 'utf8')))
      .map((file) => path.relative(SRC, file));

    expect(offenders).toEqual([]);
  });
});
