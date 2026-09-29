import { existsSync } from 'node:fs';
import { describe, expect, it } from 'vitest';

import { buildPnpmInvocation, buildToolInvocation, execTool } from '../../../scripts/lib/run-tool.mjs';

describe('buildToolInvocation', () => {
  it('runs local tools with the current Node and their bin script, never a shim', () => {
    for (const tool of ['wrangler', 'next', 'opennextjs-cloudflare', 'tsx', 'drizzle-kit', 'playwright']) {
      const invocation = buildToolInvocation(tool, ['--version']);

      expect(invocation.command).toBe(process.execPath);
      expect(existsSync(invocation.args[0])).toBe(true);
      // A script Node runs itself (Next.js's bin has no extension), never a .cmd or shell shim.
      expect(invocation.args[0]).not.toMatch(/\.(cmd|ps1|sh)$/);
      expect(invocation.args.slice(1)).toEqual(['--version']);
    }
  });

  it('rejects tools it does not know', () => {
    expect(() => buildToolInvocation('npx', [])).toThrow(/Unknown tool "npx"/);
  });
});

describe('buildPnpmInvocation', () => {
  it('runs the pnpm entry script that started this process when there is one', () => {
    expect(
      buildPnpmInvocation(['run', 'build'], {
        platform: 'win32',
        env: { npm_execpath: 'C:\\corepack\\pnpm\\9.2.0\\bin\\pnpm.cjs' },
        execPath: 'C:\\node\\node.exe',
      }),
    ).toEqual({
      command: 'C:\\node\\node.exe',
      args: ['C:\\corepack\\pnpm\\9.2.0\\bin\\pnpm.cjs', 'run', 'build'],
      options: {},
    });
  });

  it('goes through cmd.exe on Windows without an entry script', () => {
    for (const env of [{}, { npm_execpath: 'C:\\npm\\bin\\npm-cli.js' }, { npm_execpath: 'C:\\pnpm\\pnpm.exe' }]) {
      expect(buildPnpmInvocation(['run', 'build'], { platform: 'win32', env })).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', '"pnpm run build"'],
        options: { windowsVerbatimArguments: true },
      });
    }
  });

  it('refuses arguments cmd.exe would reinterpret', () => {
    expect(() => buildPnpmInvocation(['run', 'a&b'], { platform: 'win32', env: {} })).toThrow(/Cannot pass "a&b"/);
  });

  it('runs pnpm directly elsewhere', () => {
    expect(buildPnpmInvocation(['run', 'build'], { platform: 'linux', env: {} })).toEqual({
      command: 'pnpm',
      args: ['run', 'build'],
      options: {},
    });
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
