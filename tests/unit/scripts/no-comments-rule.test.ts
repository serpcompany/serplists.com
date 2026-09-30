import { Linter, RuleTester } from 'eslint';
import tseslint from 'typescript-eslint';
import { describe, expect, it } from 'vitest';

import { NO_COMMENTS_MESSAGE, noComments } from '../../../scripts/eslint-rules/no-comments.mjs';

RuleTester.describe = describe;
RuleTester.it = it;
RuleTester.itOnly = it.only;

const removeComment = (line: number, column: number) => ({ message: NO_COMMENTS_MESSAGE, line, column });

const javascript = new RuleTester();
const typescript = new RuleTester({
  languageOptions: { parser: tseslint.parser, parserOptions: { ecmaFeatures: { jsx: true } } },
});

javascript.run('no-comments in JavaScript', noComments, {
  valid: [
    { name: 'code without comments', code: 'export const answer = 42;\n' },
    { name: 'a shebang', code: '#!/usr/bin/env node\nconsole.log("run");\n' },
    {
      name: 'comment markers inside strings, templates and regular expressions',
      code: [
        "const url = 'https://serplists.com/templates/';",
        'const glob = "src/**/*.ts";',
        'const text = `// ${url} /* kept */`;',
        'const slashes = /\\/\\/+/g;',
      ].join('\n'),
    },
  ],
  invalid: [
    { name: 'a line comment', code: 'const answer = 42; // why\n', errors: [removeComment(1, 20)] },
    { name: 'a block comment', code: '/* why */\nconst answer = 42;\n', errors: [removeComment(1, 1)] },
    {
      name: 'a comment after a shebang',
      code: '#!/usr/bin/env node\n// run with node\nconsole.log("run");\n',
      errors: [removeComment(2, 1)],
    },
    {
      name: 'an eslint-disable-next-line directive',
      code: '// eslint-disable-next-line no-console\nconsole.log("run");\n',
      errors: [removeComment(1, 1)],
    },
    { name: 'a global directive', code: '/* global serplists */\nserplists.start();\n', errors: [removeComment(1, 1)] },
  ],
});

typescript.run('no-comments in TypeScript and JSX', noComments, {
  valid: [
    { name: 'a shebang in TypeScript', filename: 'cli.ts', code: '#!/usr/bin/env node\nexport const answer: number = 42;\n' },
    {
      name: 'comment markers in JSX text and attributes',
      filename: 'Link.tsx',
      code: 'export const Link = () => <a href="https://serplists.com/">// not a comment /* either */</a>;\n',
    },
  ],
  invalid: [
    {
      name: 'a JSDoc comment',
      filename: 'add.ts',
      code: '/** Adds two numbers. */\nexport const add = (a: number, b: number) => a + b;\n',
      errors: [removeComment(1, 1)],
    },
    {
      name: 'TypeScript directives',
      filename: 'directives.ts',
      code: [
        '// @ts-expect-error the value is wrong on purpose',
        'export const count: number = "one";',
        '/* @ts-ignore */',
        'export const other: number = "two";',
      ].join('\n'),
      errors: [removeComment(1, 1), removeComment(3, 1)],
    },
    { name: 'a ts-nocheck directive', filename: 'unchecked.ts', code: '// @ts-nocheck\nexport {};\n', errors: [removeComment(1, 1)] },
    {
      name: 'a triple-slash reference',
      filename: 'env.d.ts',
      code: '/// <reference types="node" />\nexport {};\n',
      errors: [removeComment(1, 1)],
    },
    {
      name: 'comments inside JSX',
      filename: 'Page.tsx',
      code: [
        'export const Page = () => (',
        '  <main /* attribute */ id="page">',
        '    {/* hidden */}',
        '    {',
        '      // line',
        '    }',
        '  </main>',
        ');',
      ].join('\n'),
      errors: [removeComment(2, 9), removeComment(3, 6), removeComment(5, 7)],
    },
  ],
});

describe('no-comments with eslint-disable comments', () => {
  const reportedLines = (code: string, linterOptions: { noInlineConfig?: boolean }) =>
    new Linter({ configType: 'flat' })
      .verify(
        code,
        [
          {
            files: ['**/*.js'],
            linterOptions,
            plugins: { serplists: { rules: { 'no-comments': noComments } } },
            rules: { 'serplists/no-comments': 'error' },
          },
        ],
        { filename: 'file.js' },
      )
      .filter((message) => message.ruleId === 'serplists/no-comments')
      .map((message) => message.line);
  const disabledFile = '/* eslint-disable */\nconst answer = 42; // why\n';

  it('is hidden by an eslint-disable comment while inline config is on', () => {
    expect(reportedLines(disabledFile, {})).toEqual([]);
  });

  it('reports the directive and every comment after it once the config sets noInlineConfig', () => {
    expect(reportedLines(disabledFile, { noInlineConfig: true })).toEqual([1, 2]);
  });
});
