import { spawnSync } from 'node:child_process';
import { existsSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  checkedLanguage,
  findComments,
  GENERATED_FILES,
  NO_COMMENTS_MESSAGE,
} from '../../../scripts/check-no-comments-lib.mjs';

const repoRoot = process.cwd();
const commentLines = (file: string, source: string[]) =>
  findComments(file, source.join('\n')).map(({ line, language }: { line: number; language: string }) => `${line} ${language}`);

describe('checkedLanguage', () => {
  it('checks YAML, TOML, SQL, CSS, JSON, XML and patches', () => {
    expect(
      [
        'lefthook.yml',
        'a.yaml',
        'wrangler.toml',
        'db/seed.sql',
        'src/app/globals.css',
        'tsconfig.json',
        'tests/fixtures/sitemap.xsd',
        'public/icon.svg',
        'patches/x.patch',
      ].map(checkedLanguage),
    ).toEqual(['yaml', 'yaml', 'toml', 'sql', 'css', 'json', 'xml', 'xml', 'patch']);
  });

  it('checks dotenv files, the Git config files in any folder and .npmrc by their names', () => {
    expect(
      ['.dev.vars.example', '.env.example', '.env.local', '.gitignore', 'docs/.gitignore', '.gitattributes', '.npmrc'].map(checkedLanguage),
    ).toEqual(['dotenv', 'dotenv', 'dotenv', 'gitignore', 'gitignore', 'gitattributes', 'npmrc']);
  });

  it('leaves TypeScript and JavaScript to the ESLint rule, even named like a dotenv file, and Markdown alone', () => {
    expect(['src/a.ts', 'src/b.tsx', 'scripts/c.mjs', 'd.cjs', 'src/.env.ts', 'README.md'].map(checkedLanguage)).toEqual([
      null,
      null,
      null,
      null,
      null,
      null,
    ]);
  });

  it('skips the files a generator writes, and each of them exists', () => {
    for (const file of GENERATED_FILES) {
      expect(checkedLanguage(file), file).toBeNull();
      expect(existsSync(path.join(repoRoot, file)), file).toBe(true);
    }
  });
});

describe('YAML', () => {
  it('reports full-line and trailing comments', () => {
    expect(commentLines('config.yml', ['# heading', 'name: serp # trailing', 'list:', '  - one # item'])).toEqual([
      '1 YAML',
      '2 YAML',
      '4 YAML',
    ]);
  });

  it('ignores # inside quoted, plain and block scalars', () => {
    expect(
      commentLines('config.yml', [
        'url: https://serplists.com/#pricing',
        'quoted: "a # b"',
        "single: 'a # b'",
        'plain: issue#42',
        'text: |',
        '  # a heading inside a block scalar',
      ]),
    ).toEqual([]);
  });

  it('reads run blocks as code only in GitHub workflows and Lefthook config', () => {
    const source = ['steps:', '  - run: |', '      # install', '      pnpm install'];
    expect(commentLines('data/example.yml', source)).toEqual([]);
    expect(commentLines('.github/workflows/ci.yml', source)).toEqual(['3 shell in a YAML run block']);
    expect(commentLines('lefthook.yml', ['pre-commit:', '  commands:', '    lint:', '      run: "pnpm lint # quietly"'])).toEqual([
      '4 shell in a YAML run block',
    ]);
  });
});

describe('shell in run blocks', () => {
  it('reports comments at the start of a word and nowhere else', () => {
    expect(
      commentLines('.github/workflows/ci.yml', [
        'jobs:',
        '  build:',
        '    steps:',
        '      - run: |',
        '          # install',
        '          pnpm install --frozen-lockfile # quietly',
        '          echo "## heading" \'not # either\' issue#42 ${#ITEMS[@]} $# ${{ github.ref_name }}',
        '          echo "url=$(grep -oE \'https://[a-z]+\\.dev/#x\' deploy.log)" >> "$GITHUB_OUTPUT"',
        '          echo "$(echo "#nested" | tr -d x)" $((16#ff))',
        "          cat <<'EOF' > notes.md",
        '          # a heading in a heredoc',
        '          EOF',
        '          echo done;# after a semicolon',
      ]),
    ).toEqual(['5 shell in a YAML run block', '6 shell in a YAML run block', '13 shell in a YAML run block']);
  });

  it('leaves run blocks in other shells unread', () => {
    expect(commentLines('.github/workflows/ci.yml', ['steps:', '  - shell: pwsh', '    run: |', '      # a PowerShell comment'])).toEqual(
      [],
    );
  });
});

describe('JavaScript in run blocks', () => {
  it('reports comments in node steps, not comment markers in strings, templates or regular expressions', () => {
    expect(
      commentLines('.github/workflows/review.yml', [
        'steps:',
        '  - shell: node {0}',
        '    env:',
        '      TOKEN: ${{ github.token }}',
        '    run: |',
        '      // why',
        '      const api = `${process.env.GITHUB_API_URL}/repos`; /* inline */',
        '      const pattern = /https?:\\/\\/[^/]+\\//;',
        "      const label = '// not a comment';",
        "      const ref = '${{ github.ref }}';",
        '      /**',
        '       * Documented.',
        '       */',
        '      console.log(api, pattern, label, ref);',
      ]),
    ).toEqual(['6 JavaScript in a YAML run block', '7 JavaScript in a YAML run block', '11 JavaScript in a YAML run block']);
  });
});

describe('TOML', () => {
  it('reports comments outside strings', () => {
    expect(
      commentLines('wrangler.toml', [
        '# heading',
        'name = "serp # checklists" # trailing',
        "url = 'https://serplists.com/#top'",
        'notes = """',
        '# not a comment',
        '"""',
        "raw = '''",
        '# not a comment either',
        "'''",
        '[vars] # table',
      ]),
    ).toEqual(['1 TOML', '2 TOML', '10 TOML']);
  });
});

describe('SQL', () => {
  it('reports line and block comments outside strings and quoted names', () => {
    expect(
      commentLines('db/migrations/0001_example.sql', [
        '-- heading',
        'CREATE TABLE notes (',
        '  id TEXT PRIMARY KEY, -- trailing',
        "  body TEXT DEFAULT 'it''s -- not a comment',",
        '  "odd--name" TEXT,',
        '  [other--name] TEXT,',
        '  `third--name` TEXT',
        ');',
        '/* block',
        '   comment */',
        "SELECT 5 - -3, '/* not */' FROM notes;",
      ]),
    ).toEqual(['1 SQL', '3 SQL', '9 SQL']);
  });
});

describe('CSS', () => {
  it('reports comments outside strings and url()', () => {
    expect(
      commentLines('src/app/globals.css', [
        '/* heading */',
        '.hero { background: url(https://serplists.com/a/*b.png); content: "/* not */"; }',
        '.card { color: red; /* trailing */ }',
      ]),
    ).toEqual(['1 CSS', '3 CSS']);
  });
});

describe('JSON with comments', () => {
  it('reports line and block comments outside strings', () => {
    expect(
      commentLines('tsconfig.json', [
        '{',
        '  // line',
        '  "url": "https://serplists.com/#x",',
        '  "glob": "src/**/*.ts", /* block */',
        '  "text": "// not"',
        '}',
      ]),
    ).toEqual(['2 JSON', '4 JSON']);
  });
});

describe('XML', () => {
  it('reports comments, not comment markers inside CDATA or a processing instruction', () => {
    expect(
      commentLines('tests/fixtures/sitemap.xsd', [
        '<?xml version="1.0"?>',
        '<!-- heading -->',
        '<schema><![CDATA[ <!-- not a comment --> ]]>',
        '<?note <!-- not one either -->?>',
        '  <element/> <!-- trailing',
        '  over two lines -->',
        '</schema>',
      ]),
    ).toEqual(['2 XML', '5 XML']);
  });
});

describe('dotenv files', () => {
  it('reports comment lines and a # after a value, which dotenv drops from an unquoted value', () => {
    expect(
      commentLines('.dev.vars.example', [
        '# heading',
        '  # indented',
        'FRONTEND_URL=http://localhost:3000 # trailing',
        'CALLBACK_URL=https://example.com/#cut',
        'export STRIPE_SECRET_KEY=sk_test_xxx',
      ]),
    ).toEqual(['1 dotenv', '2 dotenv', '3 dotenv', '4 dotenv']);
  });

  it('ignores # inside a quoted value, even one that spans lines, but not after its closing quote', () => {
    expect(
      commentLines('.env.example', [
        'EMAIL_FROM="SERP # Lists <support@example.com>"',
        "TOKEN='a#b'",
        'PRIVATE_KEY="-----BEGIN KEY-----',
        '# a line of the key',
        '-----END KEY-----"',
        'NAME="serp" # trailing',
      ]),
    ).toEqual(['6 dotenv']);
  });
});

describe('Git config files', () => {
  it('reports a .gitignore line that starts with #, and no # an escape or a space puts in a pattern', () => {
    expect(commentLines('.gitignore', ['# heading', '\\#notes.md', ' # a pattern with a space', 'logs # also a pattern', 'tmp/'])).toEqual([
      '1 .gitignore',
    ]);
  });

  it('reports a .gitattributes line whose first character after any spaces is #', () => {
    expect(commentLines('.gitattributes', ['# heading', '  # indented', '* text=auto eol=lf', '*.png binary'])).toEqual([
      '1 .gitattributes',
      '2 .gitattributes',
    ]);
  });
});

describe('.npmrc', () => {
  it('reports # and ; comment lines, and a # or ; that ends an unquoted value as npm reads it', () => {
    expect(
      commentLines('.npmrc', [
        '# heading',
        '; heading',
        '  ; indented',
        'node-linker=hoisted ; trailing',
        'save-exact=true # trailing',
        'message="released # %s"',
        'path=C:\\tools\\;build',
      ]),
    ).toEqual(['1 .npmrc', '2 .npmrc', '3 .npmrc', '4 .npmrc', '5 .npmrc']);
  });
});

describe('patches', () => {
  it('reports comments only on the lines the patch adds, at their line in the patch', () => {
    expect(
      commentLines('patches/tool@1.0.0.patch', [
        'diff --git a/dist/cli.js b/dist/cli.js',
        'index 1111111..2222222 100644',
        '--- a/dist/cli.js',
        '+++ b/dist/cli.js',
        '@@ -1,4 +1,5 @@',
        ' // upstream comment',
        ' const a = 1;',
        '-// removed comment',
        '+// added comment',
        '+const b = `// not a comment`;',
        ' const c = 3;',
        '@@ -20,3 +21,4 @@',
        ' /*',
        '  * upstream',
        '+ * added inside an upstream comment',
        '  */',
        'diff --git a/dist/relay.js b/dist/relay.js',
        'new file mode 100644',
        '--- /dev/null',
        '+++ b/dist/relay.js',
        '@@ -0,0 +1,3 @@',
        '+"use strict";',
        '+/** Documented. */',
        '+module.exports = {};',
        '\\ No newline at end of file',
        'diff --git a/src/types.d.ts b/src/types.d.ts',
        '--- a/src/types.d.ts',
        '+++ b/src/types.d.ts',
        '@@ -1 +1,2 @@',
        ' export type Id = string;',
        '+/// <reference types="node" />',
        'diff --git a/README.md b/README.md',
        '--- a/README.md',
        '+++ b/README.md',
        '@@ -1 +1 @@',
        '-old',
        '+<!-- markdown is not code -->',
      ]),
    ).toEqual([
      '9 JavaScript added by a patch',
      '15 JavaScript added by a patch',
      '23 JavaScript added by a patch',
      '31 TypeScript added by a patch',
    ]);
  });
});

describe('check-no-comments command', () => {
  const workDir = mkdtempSync(path.join(tmpdir(), 'check-no-comments-'));
  afterAll(() => rmSync(workDir, { recursive: true, force: true }));
  const run = (...files: string[]) =>
    spawnSync(process.execPath, [path.join(repoRoot, 'scripts/check-no-comments.mjs'), ...files], {
      cwd: workDir,
      encoding: 'utf8',
    });

  writeFileSync(path.join(workDir, 'clean.toml'), 'name = "serp # checklists"\n');
  writeFileSync(path.join(workDir, 'commented.toml'), '# why\nname = "serp"\n');
  writeFileSync(path.join(workDir, 'broken.css'), '.a { content: "unclosed }\n');
  writeFileSync(path.join(workDir, 'ignored.ts'), '// ESLint checks this file\n');

  it('passes files without comments', () => {
    const result = run('clean.toml', 'ignored.ts');
    expect(result.status).toBe(0);
    expect(result.stdout).toContain('check-no-comments: no comments in 1 file(s).');
  });

  it('fails with file:line and the fix-it message for each comment', () => {
    const result = run('clean.toml', 'commented.toml');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain(`commented.toml:1  ${NO_COMMENTS_MESSAGE} (TOML)`);
    expect(result.stdout).toContain('check-no-comments: 1 comment(s) in 1 file(s) (1 TOML).');
  });

  it('fails on a file it cannot parse', () => {
    const result = run('broken.css');
    expect(result.status).toBe(1);
    expect(result.stdout).toContain('broken.css  Could not be read to check for comments:');
  });
});
