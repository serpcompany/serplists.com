import { readdirSync, readFileSync, statSync } from 'node:fs';
import path from 'node:path';

import { describe, expect, it } from 'vitest';

const EDITOR_DIR = path.resolve(__dirname, '../../../../src/components/template-editor');
const ROW_ACTIONS_REVEAL_CLASS_SOURCE = path.resolve(__dirname, '../../../../src/components/ui/hover-reveal.ts');

function sourceFiles(dir: string): string[] {
  return readdirSync(dir).flatMap((entry) => {
    const full = path.join(dir, entry);
    if (statSync(full).isDirectory()) return sourceFiles(full);
    return /\.(ts|tsx)$/.test(entry) ? [full] : [];
  });
}

function hoverRevealedClassStrings(): Array<{ file: string; value: string }> {
  return [...sourceFiles(EDITOR_DIR), ROW_ACTIONS_REVEAL_CLASS_SOURCE].flatMap((file) => {
    const source = readFileSync(file, 'utf8');
    return [...source.matchAll(/(["'`])((?:(?!\1)[^\\\n]|\\.)*)\1/g)]
      .map((match) => match[2])
      .filter((value) => /(^|\s)opacity-0(\s|$)/.test(value) && /group-hover:opacity-100/.test(value))
      .map((value) => ({ file: path.relative(EDITOR_DIR, file), value }));
  });
}

describe('template editor row actions (remove a section, task or content block)', () => {
  it('has hover-revealed controls to check', () => {
    expect(hoverRevealedClassStrings().length).toBeGreaterThan(0);
  });

  it('reveals every hover-revealed control on keyboard focus and on touch screens, so Enter never acts on an invisible Remove button', () => {
    const missing = hoverRevealedClassStrings().filter(
      ({ value }) =>
        !value.includes('group-focus-within:opacity-100') ||
        !value.includes('focus-visible:opacity-100') ||
        !value.includes('[@media(hover:none)]:opacity-100'),
    );

    expect(missing).toEqual([]);
  });
});
