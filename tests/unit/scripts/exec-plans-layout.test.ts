import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

// docs/exec-plans/active/ and completed/ are named in AGENTS.md and read by the
// maintenance report. Git drops a directory once its last file moves out, so each
// keeps a tracked placeholder and still exists in a fresh checkout when empty.
describe('exec plan folders', () => {
  it('track a placeholder in active/ and completed/', () => {
    const placeholders = ['docs/exec-plans/active/.gitkeep', 'docs/exec-plans/completed/.gitkeep'];
    const tracked = execFileSync('git', ['ls-files', '--', ...placeholders], { encoding: 'utf8' })
      .split('\n')
      .filter(Boolean);
    expect(tracked.sort()).toEqual(placeholders);
  });
});
