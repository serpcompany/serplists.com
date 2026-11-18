import { describe, expect, it } from 'vitest';

import { findCommentProblems } from '../../../../scripts/checks/comments';
import { located } from '../../../../scripts/checks/problems';
import { scratchFolder, writeFiles } from './scratch';

async function commentsIn(files: Readonly<Record<string, string>>) {
  const root = scratchFolder('comments');
  writeFiles(root, files);
  return (await findCommentProblems(root, Object.keys(files))).map(located);
}

describe('the comment check', { timeout: 60_000 }, () => {
  it('fails every comment in TypeScript and JavaScript through the ESLint rule, a directive included, but not a shebang', async () => {
    expect(
      await commentsIn({
        'src/a.ts': 'export const a = 1; // why\n',
        'src/b.tsx': '/* eslint-disable */\nexport const B = () => <p>{/* hidden */}</p>;\n',
        'tools/c.mjs': '#!/usr/bin/env node\nconsole.log(1);\n',
      }),
    ).toEqual([
      'src/a.ts:1  export const a = 1; // why',
      'src/b.tsx:1  /* eslint-disable */',
      'src/b.tsx:2  export const B = () => <p>{/* hidden */}</p>;',
    ]);
  });

  it('fails a comment in every other format it reads, an HTML comment in Markdown included', async () => {
    expect(
      await commentsIn({
        'config.yml': 'name: serp # why\n',
        'wrangler.toml': '# why\nname = "serp"\n',
        'db/seed.sql': '-- why\nselect 1;\n',
        'src/app.css': '/* why */\n.a { color: red; }\n',
        'tsconfig.json': '{\n  // why\n  "strict": true\n}\n',
        'docs/a.md': '# A\n\n<!-- why -->\n',
      }),
    ).toEqual([
      'config.yml:1  name: serp # why (YAML)',
      'wrangler.toml:1  # why (TOML)',
      'db/seed.sql:1  -- why (SQL)',
      'src/app.css:1  /* why */ (CSS)',
      'tsconfig.json:2  // why (JSON)',
      'docs/a.md:3  <!-- why --> (Markdown)',
    ]);
  });

  it('passes files without comments, and leaves a file a generator writes alone', async () => {
    expect(
      await commentsIn({
        'src/a.ts': "export const url = 'https://serplists.com/#pricing';\n",
        'name.toml': 'name = "serp # checklists"\n',
        'cloudflare-env.d.ts': '/* eslint-disable */\ninterface CloudflareEnv {}\n',
      }),
    ).toEqual([]);
  });

  it('shows the first 77 characters of a long line that holds a comment, with the line ending left off', async () => {
    const longLine = `export const message = '${'x'.repeat(80)}'; // why`;

    expect(await commentsIn({ 'src/long.ts': `${longLine}\r\n`, 'config.yml': 'a: 1\r\n  # why\r\n' })).toEqual([
      `src/long.ts:1  ${longLine.slice(0, 77)}...`,
      'config.yml:2  # why (YAML)',
    ]);
  });

  it.each([
    ['a lone carriage return', 'export const a = 1;\r// why\r'],
    ['a Windows line ending', 'export const a = 1;\r\n// why\r\n'],
    ['a line separator', `export const a = 1;${String.fromCodePoint(0x2028)}// why\n`],
    ['a paragraph separator', `export const a = 1;${String.fromCodePoint(0x2029)}// why\n`],
  ])('fails a comment in a script after %s, at the line ESLint counts, showing that line', async (_ending, text) => {
    expect(await commentsIn({ 'src/ended.ts': text })).toEqual(['src/ended.ts:2  // why']);
  });

  it('fails a comment in a stylesheet at the line it counts by newlines alone, showing that line', async () => {
    expect(await commentsIn({ 'src/old-mac.css': '.a { color: red; }\r/* why */\r' })).toEqual(['src/old-mac.css:1  .a { color: red; }\r/* why */ (CSS)']);
    expect(await commentsIn({ 'src/separated.css': `.a { color: red; }${String.fromCodePoint(0x2028)}/* why */\n` })).toEqual([
      `src/separated.css:1  .a { color: red; }${String.fromCodePoint(0x2028)}/* why */ (CSS)`,
    ]);
  });

  it('fails a file it cannot parse, rather than passing it unread', async () => {
    const problems = await commentsIn({ 'src/broken.ts': 'export const = ;\n', 'src/broken.css': '.a { content: "unclosed }\n' });
    expect(problems).toEqual([
      expect.stringMatching(/^src\/broken\.ts:1 {2}could not be parsed: /),
      expect.stringMatching(/^src\/broken\.css {2}could not be read to look for comments: /),
    ]);
  });
});
