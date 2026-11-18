import { chmodSync, copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import path from 'node:path';

const onPath = (bin: string) => `${bin}${path.delimiter}${process.env['PATH'] ?? ''}`;

function aTaskkillThatRefuses(bin: string): Record<string, string> {
  copyFileSync(process.execPath, path.join(bin, 'taskkill.exe'));
  const refusal = path.join(bin, 'refuse-as-taskkill.cjs');
  writeFileSync(
    refusal,
    [
      'if (require("node:path").basename(process.execPath).toLowerCase() === "taskkill.exe") {',
      '  process.stderr.write(`ERROR: The process with PID ${process.argv[2]} could not be terminated.\\nReason: Access is denied.\\n`);',
      '  process.exit(1);',
      '}',
      '',
    ].join('\n'),
  );
  return { PATH: onPath(bin), NODE_OPTIONS: `--require=${refusal}` };
}

function aPsThatSeesTheLauncherExit(bin: string, pid: number): Record<string, string> {
  const launcher = execFileSync('ps', ['-o', 'lstart=', '-o', 'args=', '-p', String(pid)], { encoding: 'utf8', env: { ...process.env, LC_ALL: 'C' } });
  const ps = path.join(bin, 'ps');
  writeFileSync(
    ps,
    ['#!/bin/sh', `kill -TERM ${pid}`, `while kill -0 ${pid} 2>/dev/null; do sleep 0.05; done`, `printf '%s\\n' '${launcher.trim()}'`, ''].join('\n'),
  );
  chmodSync(ps, 0o755);
  return { PATH: onPath(bin) };
}

export function aKillThatFails(folder: string, pid: number): Record<string, string> {
  const bin = path.join(folder, 'bin');
  mkdirSync(bin, { recursive: true });
  return process.platform === 'win32' ? aTaskkillThatRefuses(bin) : aPsThatSeesTheLauncherExit(bin, pid);
}
