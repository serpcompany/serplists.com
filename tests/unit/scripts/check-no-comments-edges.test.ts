import { describe, expect, it } from 'vitest';

import { findComments } from '../../../scripts/check-no-comments-lib';

const commentLines = (file: string, source: string[]) => findComments(file, source.join('\n')).map(({ line }) => line);

const patchAdding = (target: string, added: string[]) => [
  `--- a/${target}`,
  `+++ b/${target}`,
  `@@ -0,0 +1,${added.length} @@`,
  ...added.map((line) => `+${line}`),
];

describe('strings that never close', () => {
  it('reads the rest of a TOML file as the string an unclosed multi-line string starts', () => {
    expect(commentLines('wrangler.toml', ['name = "app" # one', 'text = """', 'no # comment here'])).toEqual([1]);
  });

  it('ends a TOML string that never closes at the end of its line', () => {
    expect(commentLines('wrangler.toml', ['a = "open', '# two', "b = 'open", '# four'])).toEqual([2, 4]);
  });

  it('reads past escaped quotes and extra closing quotes in TOML multi-line strings', () => {
    expect(commentLines('wrangler.toml', ['a = """one \\""" # still inside"""', 'b = """"quoted"""" # five', "c = '''x''' # six"])).toEqual([2, 3]);
  });

  it('reads the rest of a SQL file as an unclosed string, block comment or quoted name', () => {
    expect(commentLines('db/seed.sql', ["SELECT 'it''s -- not a comment'; -- one", "SELECT 'open -- not", '-- not either'])).toEqual([1]);
    expect(commentLines('db/seed.sql', ['SELECT 1; /* open', 'still the comment'])).toEqual([1]);
  });

  it('reads the rest of an XML file as an unclosed comment', () => {
    expect(commentLines('public/icon.svg', ['<svg>', '<!-- open', '</svg>'])).toEqual([2]);
  });
});

describe('shell quoting', () => {
  const workflow = (lines: string[]) => ['jobs:', '  check:', '    steps:', '      - run: |', ...lines.map((line) => `          ${line}`)];

  it('reads ANSI-C quotes, here-strings, backquotes and parameter defaults as words, not comments', () => {
    expect(
      commentLines('.github/workflows/ci.yml', workflow([
        "echo $'it\\'s # not a comment'",
        'cat <<< "# not a comment" # six',
        'echo `printf "# not"` # seven',
        'echo ${NAME:-"# not"} # eight',
        'echo $"# not" # nine',
      ])),
    ).toEqual([6, 7, 8, 9]);
  });

  it('skips a tab-stripped heredoc body, and finds comments in subshells and after a bare $', () => {
    expect(
      commentLines('.github/workflows/ci.yml', workflow([
        'cat <<-END',
        '\t# not a comment',
        '\tEND',
        "(cd app && echo ${A:-'# not'} ${B:-\\}} # eight)",
        'echo $ # nine',
        "echo 'never closed # not a comment",
      ])),
    ).toEqual([8, 9]);
  });
});

describe('script comments added by a patch', () => {
  it('reports a comment after a shebang, not the shebang', () => {
    expect(commentLines('patches/x.patch', patchAdding('bin/run.mjs', ['#!/usr/bin/env node', '// four', 'run();']))).toEqual([5]);
  });

  it('reads JSX text as text and finds the comments around elements', () => {
    expect(
      commentLines('patches/x.patch', patchAdding('src/a.tsx', [
        'const a = <p>// not a comment</p>;',
        'const b = <>',
        '  <br /> // still text',
        '  {value} // text too',
        '</>; // eight',
        'const c = <div>{/* nine */}</div>;',
        'const d = <img /> // ten',
      ])),
    ).toEqual([8, 9, 10]);
  });
});

describe('patches that add no checked lines', () => {
  it('reads nothing from a file the patch deletes, or from a file type with no comment check', () => {
    const deleted = ['--- a/src/old.ts', '+++ /dev/null', '@@ -1 +0,0 @@', '-// gone'];
    expect(commentLines('patches/x.patch', [...deleted, ...patchAdding('assets/logo.png', ['# binary-ish'])])).toEqual([]);
  });

  it('reads a hunk header without line counts as one line', () => {
    expect(commentLines('patches/x.patch', ['--- a/a.sql', '+++ b/a.sql', '@@ -1 +1 @@', '-SELECT 1;', '+SELECT 1; -- four'])).toEqual([5]);
  });
});

describe('files the comment check leaves to ESLint', () => {
  it('finds nothing in TypeScript, which the ESLint rule checks', () => {
    expect(commentLines('src/a.ts', ['// a comment ESLint reports'])).toEqual([]);
  });
});

describe('configuration files', () => {
  it('skips blank .npmrc lines and lines with no value, and reads a quoted value whole', () => {
    expect(commentLines('.npmrc', ['', '   ', 'always-auth', 'registry="https://x/#not"', 'cache=/tmp\\;x ; five'])).toEqual([5]);
  });

  it('reads past an escaped quote in a quoted dotenv value', () => {
    expect(commentLines('.env.example', ['A="say \\"# not\\"" # one', 'B="open'])).toEqual([1]);
  });
});
