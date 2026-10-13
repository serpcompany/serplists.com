import { existsSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { alreadyTold, changedPaths, installAdvice, routeHook, toldFile } from '../../../../tools/checks/route.mjs';
import { scratchFolder } from './scratch';

const worktree = '/work/main/.claude/worktrees/task';
const theirChecks = path.join(worktree, 'scripts', 'checks', 'hook.ts');
const theirLoader = path.join(worktree, 'node_modules', 'tsx', 'package.json');

describe('which checks a hook runs', () => {
  it("runs the owning checkout's own checks, a worktree's included", () => {
    const has = (file: string) => file === theirChecks || file === theirLoader;
    expect(routeHook(worktree, 'hook.ts', has)).toEqual({ kind: 'run', checkout: worktree, script: theirChecks });
  });

  it("asks for an install when the checkout's packages are missing", () => {
    expect(routeHook(worktree, 'hook.ts', (file) => file === theirChecks)).toEqual({ kind: 'install', checkout: worktree });
    expect(installAdvice(worktree)).toMatch(/Run pnpm install there/);
  });

  it('skips a file in no repository, and a repository without these checks', () => {
    expect(routeHook(undefined, 'hook.ts', () => true)).toEqual({ kind: 'skip' });
    expect(routeHook('/work/other', 'stop-hook.ts', () => false)).toEqual({ kind: 'skip' });
  });
});

describe('what the stop hook checks and tells', () => {
  it('lists each changed or new file once, in order', () => {
    expect(changedPaths('docs/b.md\0src/a.ts\0', 'src/a.ts\0new file.ts\0')).toEqual(['docs/b.md', 'new file.ts', 'src/a.ts']);
    expect(changedPaths('', '')).toEqual([]);
  });

  it('tells a session about the same failures once', () => {
    const file = toldFile(scratchFolder('route'), 'session-1');
    expect(alreadyTold(file, 'a broken link')).toBe(false);
    expect(alreadyTold(file, 'a broken link')).toBe(true);
    expect(alreadyTold(file, 'another broken link')).toBe(false);
  });

  it('keeps no record for a session it cannot name safely', () => {
    const checkout = scratchFolder('route');
    expect(toldFile(checkout, undefined)).toBeUndefined();
    expect(toldFile(checkout, '../outside')).toBeUndefined();
    expect(alreadyTold(undefined, 'a broken link')).toBe(false);
    expect(existsSync(path.join(checkout, 'tmp'))).toBe(false);
  });

  it('keeps its record under tmp/agent/stop-hook/, which git ignores', () => {
    expect(toldFile('/work/main', 'session-1')).toBe(path.join('/work/main', 'tmp', 'agent', 'stop-hook', 'session-1.txt'));
  });
});
