import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { root } from '../../../../scripts/checks/files';
import { buildScriptInvocation } from '../../../../scripts/lib/run-tool';

function verify(...args: string[]) {
  const { command, args: nodeArgs } = buildScriptInvocation(path.join(root, 'scripts/checks/cli.ts'), args);
  return spawnSync(command, nodeArgs, { cwd: root, encoding: 'utf8' });
}

describe('pnpm run verify', { timeout: 60_000 }, () => {
  it('refuses a check it does not know, naming the ones it runs', () => {
    const result = verify('comments,spelling', 'scripts/checks');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('Unknown check spelling. Run any of: comments, docs, sizes, secrets, duplicates, deadcode, dependencies, linters, generated');
  });

  it('refuses paths that hold no repository file, rather than passing having checked nothing', () => {
    const result = verify('sizes', 'scripts/no-such-folder');
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('No repository file is under scripts/no-such-folder. Name paths relative to the repository root');
  });

  it('runs the checks it is given on the paths it is given, and says how each went', () => {
    const result = verify('sizes,secrets', 'scripts/checks/cli.ts', 'scripts/checks/rules.ts');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('sizes passed, secrets passed');
  });
});
