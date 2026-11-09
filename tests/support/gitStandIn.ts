import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const pathVariable = Object.keys(process.env).find((name) => name.toUpperCase() === 'PATH') ?? 'PATH';

export function aGitStandIn(binFolder: string, cwd: string, subcommands: Readonly<Record<string, string>>): Record<string, string> {
  mkdirSync(binFolder, { recursive: true });
  copyFileSync(process.execPath, path.join(binFolder, `git${path.extname(process.execPath)}`));
  for (const [subcommand, script] of Object.entries(subcommands)) writeFileSync(path.join(cwd, subcommand), script);
  return { [pathVariable]: `${binFolder}${path.delimiter}${process.env[pathVariable] ?? ''}` };
}
