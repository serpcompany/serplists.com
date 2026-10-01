import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import {
  buildPnpmInvocation,
  buildToolInvocation,
  execTool,
  killProcessTree,
  type ToolName,
} from '../../../scripts/lib/run-tool.mjs';

const LOCAL_TOOLS: ToolName[] = ['wrangler', 'next', 'opennextjs-cloudflare', 'tsx', 'drizzle-kit', 'playwright'];

const envStartedBy = (npmExecPath?: string): NodeJS.ProcessEnv => ({ ...process.env, npm_execpath: npmExecPath });

describe('buildToolInvocation', () => {
  it('runs local tools with the current Node and their bin script, never a shim', () => {
    for (const tool of LOCAL_TOOLS) {
      const invocation = buildToolInvocation(tool, ['--version']);

      expect(invocation.command).toBe(process.execPath);
      expect(existsSync(invocation.args[0])).toBe(true);
      expect(invocation.args[0]).not.toMatch(/\.(cmd|ps1|sh)$/);
      expect(invocation.args.slice(1)).toEqual(['--version']);
    }
  });
});

describe('buildPnpmInvocation', () => {
  it('runs the pnpm entry script that started this process when there is one', () => {
    expect(
      buildPnpmInvocation(['run', 'build'], {
        platform: 'win32',
        env: envStartedBy('C:\\corepack\\pnpm\\9.2.0\\bin\\pnpm.cjs'),
        execPath: 'C:\\node\\node.exe',
      }),
    ).toEqual({
      command: 'C:\\node\\node.exe',
      args: ['C:\\corepack\\pnpm\\9.2.0\\bin\\pnpm.cjs', 'run', 'build'],
      options: {},
    });
  });

  it('goes through cmd.exe on Windows without an entry script', () => {
    for (const env of [envStartedBy(), envStartedBy('C:\\npm\\bin\\npm-cli.js'), envStartedBy('C:\\pnpm\\pnpm.exe')]) {
      expect(buildPnpmInvocation(['run', 'build'], { platform: 'win32', env })).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', '"pnpm run build"'],
        options: { windowsVerbatimArguments: true },
      });
    }
  });

  it('refuses arguments cmd.exe would reinterpret', () => {
    expect(() => buildPnpmInvocation(['run', 'a&b'], { platform: 'win32', env: envStartedBy() })).toThrow(/Cannot pass "a&b"/);
  });

  it('runs pnpm directly elsewhere', () => {
    expect(buildPnpmInvocation(['run', 'build'], { platform: 'linux', env: envStartedBy() })).toEqual({
      command: 'pnpm',
      args: ['run', 'build'],
      options: {},
    });
  });
});

describe('killProcessTree', () => {
  const pidNoProcessHolds = 2 ** 22 + 1;

  it('signals nothing once the child has exited', () => {
    expect(killProcessTree({ pid: pidNoProcessHolds, exitCode: 0, signalCode: null } as never)).toBe(false);
    expect(killProcessTree({ pid: pidNoProcessHolds, exitCode: null, signalCode: 'SIGTERM' } as never)).toBe(false);
  });

  it('reports a failed taskkill on Windows instead of throwing, as when the child exits just before it', () => {
    expect(
      killProcessTree({ pid: pidNoProcessHolds, exitCode: null, signalCode: null } as never, 'SIGTERM', { platform: 'win32' }),
    ).toBe(false);
  });
});

describe('execTool', { timeout: 60_000 }, () => {
  it('starts local tools on this OS', () => {
    expect(execTool('next', ['--version'], { encoding: 'utf8' })).toMatch(/Next\.js v\d+\.\d+/);
    expect(execTool('wrangler', ['--version'], { encoding: 'utf8', env: { ...process.env, CI: '1' } })).toMatch(
      /\d+\.\d+\.\d+/,
    );
  });
});
