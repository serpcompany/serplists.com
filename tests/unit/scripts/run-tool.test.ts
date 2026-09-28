import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  buildPnpmInvocation,
  buildShellCommandLine,
  buildToolInvocation,
  execTool,
} from '../../../scripts/lib/run-tool.mjs';

const fixtureDir = mkdtempSync(path.join(tmpdir(), 'run-tool-'));
const printArgv = path.join(fixtureDir, 'print argv.cjs');
writeFileSync(printArgv, 'process.stdout.write(JSON.stringify(process.argv.slice(2)));\n');

afterAll(() => {
  rmSync(fixtureDir, { recursive: true, force: true });
});

// Runs a command line the way concurrently does on this OS.
function runThroughShell(line: string) {
  const result =
    process.platform === 'win32'
      ? spawnSync('cmd.exe', ['/s', '/c', `"${line}"`], { encoding: 'utf8', windowsVerbatimArguments: true })
      : spawnSync('/bin/sh', ['-c', line], { encoding: 'utf8' });
  expect(result.stderr).toBe('');
  return JSON.parse(result.stdout);
}

const trickyArgs = [
  'BETTER_AUTH_SECRET=a&b^c"d%PATH%!e|f<g>h',
  'CORS_ALLOWED_ORIGINS=http://localhost:8080,http://localhost:8081',
  'value with spaces',
  'C:\\dir with space\\',
  "it's $(echo nope) `echo nope` $HOME",
  '(parens);semi*?',
  '',
];

describe('buildToolInvocation', () => {
  it('runs local tools with the current Node and their bin script, never a shim', () => {
    for (const tool of ['wrangler', 'vite', 'tsx', 'concurrently', 'playwright']) {
      const invocation = buildToolInvocation(tool, ['--version']);

      expect(invocation.command).toBe(process.execPath);
      expect(existsSync(invocation.args[0])).toBe(true);
      expect(invocation.args[0]).toMatch(/\.(c|m)?js$/);
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
      buildPnpmInvocation(['run', 'build:dev'], {
        platform: 'win32',
        env: { npm_execpath: 'C:\\corepack\\pnpm\\9.2.0\\bin\\pnpm.cjs' },
        execPath: 'C:\\node\\node.exe',
      }),
    ).toEqual({
      command: 'C:\\node\\node.exe',
      args: ['C:\\corepack\\pnpm\\9.2.0\\bin\\pnpm.cjs', 'run', 'build:dev'],
      options: {},
    });
  });

  it('goes through cmd.exe on Windows without an entry script', () => {
    for (const env of [{}, { npm_execpath: 'C:\\npm\\bin\\npm-cli.js' }, { npm_execpath: 'C:\\pnpm\\pnpm.exe' }]) {
      expect(buildPnpmInvocation(['run', 'build:dev'], { platform: 'win32', env })).toEqual({
        command: 'cmd.exe',
        args: ['/d', '/s', '/c', '"pnpm run build:dev"'],
        options: { windowsVerbatimArguments: true },
      });
    }
  });

  it('refuses arguments cmd.exe would reinterpret', () => {
    expect(() => buildPnpmInvocation(['run', 'a&b'], { platform: 'win32', env: {} })).toThrow(/Cannot pass "a&b"/);
  });

  it('runs pnpm directly elsewhere', () => {
    expect(buildPnpmInvocation(['run', 'build:dev'], { platform: 'linux', env: {} })).toEqual({
      command: 'pnpm',
      args: ['run', 'build:dev'],
      options: {},
    });
  });
});

describe('buildShellCommandLine', () => {
  it('escapes cmd.exe metacharacters inside quoted arguments', () => {
    expect(buildShellCommandLine({ command: 'C:\\Program Files\\node.exe', args: ['a&b', 'x y'] }, 'win32')).toBe(
      'C:\\Program^ Files\\node.exe ^"a^&b^" ^"x^ y^"',
    );
  });

  it('single-quotes POSIX arguments that need it', () => {
    expect(buildShellCommandLine({ command: '/usr/bin/node', args: ['--port', '8788', "it's", 'a b'] }, 'linux')).toBe(
      "/usr/bin/node --port 8788 'it'\\''s' 'a b'",
    );
  });

  it('delivers every argument literally through this OS shell', () => {
    const line = buildShellCommandLine({ command: process.execPath, args: [printArgv, ...trickyArgs] });

    expect(runThroughShell(line)).toEqual(trickyArgs);
  });
});

describe('execTool', { timeout: 60_000 }, () => {
  it('passes a command line through concurrently unchanged, as dev:all does', () => {
    const line = buildShellCommandLine({ command: process.execPath, args: [printArgv, ...trickyArgs] });

    const output = execTool('concurrently', ['--raw', line], { encoding: 'utf8' });

    expect(JSON.parse(String(output).trim())).toEqual(trickyArgs);
  });

  it('starts local tools on this OS', () => {
    expect(execTool('vite', ['--version'], { encoding: 'utf8' })).toMatch(/vite\/\d+\.\d+/);
    expect(execTool('wrangler', ['--version'], { encoding: 'utf8', env: { ...process.env, CI: '1' } })).toMatch(
      /\d+\.\d+\.\d+/,
    );
  });
});
