import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

describe('exec plan folders', () => {
  it('track a placeholder in active/ and completed/, so both exist in a fresh checkout when empty', () => {
    const placeholders = ['docs/exec-plans/active/.gitkeep', 'docs/exec-plans/completed/.gitkeep'];
    const tracked = execFileSync('git', ['ls-files', '--', ...placeholders], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(tracked.sort()).toEqual(placeholders);
  });
});
