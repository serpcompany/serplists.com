import { copyFileSync, mkdirSync, writeFileSync } from 'node:fs';
import path from 'node:path';

export type GhAnswer = { status: number; stdout: string };

export function aGhStandIn(binFolder: string, cwd: string, answers: Record<string, GhAnswer>): string {
  mkdirSync(binFolder, { recursive: true });
  copyFileSync(process.execPath, path.join(binFolder, process.platform === 'win32' ? 'gh.exe' : 'gh'));
  writeFileSync(
    path.join(cwd, 'api'),
    [
      `const answers = ${JSON.stringify(answers)};`,
      "const answer = answers[process.argv[2]] ?? { status: 1, stdout: '' };",
      'process.stdout.write(answer.stdout);',
      "if (answer.status !== 0) process.stderr.write('HTTP 404: Not Found');",
      'process.exitCode = answer.status;',
      '',
    ].join('\n'),
  );
  return `${binFolder}${path.delimiter}${process.env['PATH'] ?? ''}`;
}
