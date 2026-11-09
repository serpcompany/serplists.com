import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

export type FetchAnswer = { status: number; body: string } | { thrown: string };

export function nodeOptionsWithAFetchStandIn(folder: string, answers: Record<string, FetchAnswer>): string {
  const preload = path.join(folder, 'fetch-stand-in.mjs');
  writeFileSync(
    preload,
    [
      `const answers = ${JSON.stringify(answers)};`,
      'globalThis.fetch = async (url) => {',
      "  const answer = answers[String(url)] ?? { status: 404, body: 'Not Found' };",
      "  if ('thrown' in answer) throw answer.thrown;",
      '  return new Response(answer.body, { status: answer.status });',
      '};',
      '',
    ].join('\n'),
  );
  return `--import=${pathToFileURL(preload).href}`;
}
