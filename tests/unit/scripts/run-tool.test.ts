import { ChildProcess } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterAll, describe, expect, it } from 'vitest';
import { firstOf } from '../../support/elements';

import {
  buildPnpmInvocation,
  buildScriptInvocation,
  buildToolInvocation,
  execScript,
  execTool,
  killProcessTree,
  type ToolName,
} from '../../../scripts/lib/run-tool';

const LOCAL_TOOLS: ToolName[] = ['wrangler', 'next', 'opennextjs-cloudflare', 'drizzle-kit', 'playwright'];

const envStartedBy = (npmExecPath?: string): NodeJS.ProcessEnv => ({ ...process.env, npm_execpath: npmExecPath });

describe('buildToolInvocation', () => {
  it('runs local tools with the current Node and their bin script, never a shim', () => {
    for (const tool of LOCAL_TOOLS) {
      const invocation = buildToolInvocation(tool, ['--version']);

      expect(invocation.command).toBe(process.execPath);
      expect(existsSync(firstOf(invocation.args))).toBe(true);
      expect(invocation.args[0]).not.toMatch(/\.(cmd|ps1|sh)$/);
      expect(invocation.args.slice(1)).toEqual(['--version']);
    }
  });
});

describe('buildScriptInvocation', () => {
  it("runs a script in the current Node with tsx's loader, named by an absolute file URL", () => {
    const { command, args, options } = buildScriptInvocation('scripts/check-docs.ts', ['--flag']);

    expect(command).toBe(process.execPath);
    expect(args[0]).toBe('--import');
    expect(existsSync(fileURLToPath(firstOf(args.slice(1))))).toBe(true);
    expect(args.slice(2)).toEqual(['scripts/check-docs.ts', '--flag']);
    expect(options).toEqual({});
  });
});

describe('execScript', { timeout: 60_000 }, () => {
  const outsideTheRepository = mkdtempSync(path.join(tmpdir(), 'run-tool-script-'));
  afterAll(() => rmSync(outsideTheRepository, { recursive: true, force: true }));

  it('runs a TypeScript script from a folder outside the repository, where no tsx package resolves', () => {
    const script = path.join(outsideTheRepository, 'typed.ts');
    writeFileSync(script, 'const answer: number = 42;\nconsole.log(`answer ${answer}`);\n');

    expect(execScript(script, [], { cwd: outsideTheRepository, encoding: 'utf8' })).toBe('answer 42\n');
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

  const childThat = (ended: { exitCode: number | null; signalCode: NodeJS.Signals | null }) =>
    Object.assign(new ChildProcess(), { pid: pidNoProcessHolds, ...ended });

  it('signals nothing once the child has exited', () => {
    expect(killProcessTree(childThat({ exitCode: 0, signalCode: null }))).toBe(false);
    expect(killProcessTree(childThat({ exitCode: null, signalCode: 'SIGTERM' }))).toBe(false);
  });

  it('reports a failed taskkill on Windows instead of throwing, as when the child exits just before it', () => {
    expect(
      killProcessTree(childThat({ exitCode: null, signalCode: null }), 'SIGTERM', { platform: 'win32' }),
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
