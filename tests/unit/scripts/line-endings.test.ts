import { execFileSync } from 'node:child_process';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';
import { z } from 'zod';

const commandOutput = z.object({ stdout: z.string().optional(), stderr: z.string().optional() }).passthrough();

import { matchesGeneratedText, normalizeEol } from '../../../scripts/lib/line-endings.mjs';
import { buildToolInvocation } from '../../../scripts/lib/run-tool.mjs';

const repoRoot = process.cwd();
const toCrlf = (text: string) => text.replace(/\r?\n/g, '\r\n');
const git = (args: string[]) => execFileSync('git', args, { cwd: repoRoot, encoding: 'utf8' });

const GENERATED_FILES = [
  'docs/generated/db-schema.md',
  'docs/generated/portable-template-pack.schema.json',
  'db/sql-only-schema.json',
  'functions/sitemap/bundled-catalog.generated.json',
  'docs/product-specs/portable-templates/examples/full/template.json',
  'docs/product-specs/portable-templates/examples/full/template.md',
  'docs/product-specs/portable-templates/examples/full/README.md',
  'docs/product-specs/portable-templates/examples/full/preview.html',
];

describe('normalizeEol', () => {
  it('turns CRLF into LF and leaves LF, lone CR and escaped sequences alone', () => {
    expect(normalizeEol('a\r\nb\nc\r\n')).toBe('a\nb\nc\n');
    expect(normalizeEol('a\rb')).toBe('a\rb');
    expect(normalizeEol('{"value": "line\\r\\nnext"}\r\n')).toBe('{"value": "line\\r\\nnext"}\n');
  });
});

describe('matchesGeneratedText', () => {
  const generated = '# Title\n\n| a | b |\n';

  it('accepts the same content with LF, CRLF or mixed line endings', () => {
    expect(matchesGeneratedText(generated, generated)).toBe(true);
    expect(matchesGeneratedText(toCrlf(generated), generated)).toBe(true);
    expect(matchesGeneratedText('# Title\r\n\n| a | b |\r\n', generated)).toBe(true);
  });

  it('still reports real drift, a missing final newline and a missing file', () => {
    expect(matchesGeneratedText('# Other\r\n\r\n| a | b |\r\n', generated)).toBe(false);
    expect(matchesGeneratedText('# Title\n\n| a | b |', generated)).toBe(false);
    expect(matchesGeneratedText('', generated)).toBe(false);
    expect(matchesGeneratedText(null, generated)).toBe(false);
  });
});

describe('.gitattributes', () => {
  it('checks text files out with LF whatever core.autocrlf says', () => {
    const attributes = readFileSync(path.join(repoRoot, '.gitattributes'), 'utf8');
    expect(attributes).toMatch(/^\* text=auto eol=lf$/m);

    const output = git(['check-attr', 'eol', '--', ...GENERATED_FILES]);
    for (const file of GENERATED_FILES) {
      expect(output).toContain(`${file}: eol: lf`);
    }
  });

  it('marks every tracked binary file as binary and stores no CRLF in the index', () => {
    const entries = git(['ls-files', '--eol']).trim().split('\n').map((line) => {
      const [info = '', file] = line.split('\t');
      return { index: info.split(/\s+/)[0], attributes: info.split(/\s+/)[2] ?? '', file };
    });

    expect(entries.filter((entry) => entry.index === 'i/crlf' || entry.index === 'i/mixed')).toEqual([]);
    expect(entries.filter((entry) => entry.index === 'i/-text' && entry.attributes !== 'attr/-text')).toEqual([]);
  });
});

describe('generated artifact checks on a CRLF checkout', () => {
  const tempRoots: string[] = [];

  afterAll(() => {
    for (const root of tempRoots) rmSync(root, { recursive: true, force: true });
  });

  const runCheckOnACrlfCopy = (script: string, files: string[], edit: (file: string, text: string) => string = (_, text) => text) => {
    const cwd = mkdtempSync(path.join(tmpdir(), 'serplists-eol-'));
    tempRoots.push(cwd);
    for (const file of files) {
      mkdirSync(path.dirname(path.join(cwd, file)), { recursive: true });
      writeFileSync(path.join(cwd, file), toCrlf(edit(file, readFileSync(path.join(repoRoot, file), 'utf8'))));
    }
    const invocation = buildToolInvocation('tsx', [
      '--tsconfig',
      path.join(repoRoot, 'tsconfig.json'),
      path.join(repoRoot, script),
      '--check',
    ]);
    try {
      execFileSync(invocation.command, invocation.args, { cwd, encoding: 'utf8', stdio: 'pipe' });
      return { ok: true, output: '' };
    } catch (error) {
      const failure = commandOutput.parse(error);
      return { ok: false, output: `${failure.stdout ?? ''}${failure.stderr ?? ''}` };
    }
  };

  it('accepts a CRLF copy of docs/generated/db-schema.md and still flags drift', () => {
    const files = ['docs/generated/db-schema.md', 'db/sql-only-schema.json'];
    expect(runCheckOnACrlfCopy('scripts/generate-db-schema-doc.ts', files)).toEqual({ ok: true, output: '' });

    const drifted = runCheckOnACrlfCopy('scripts/generate-db-schema-doc.ts', files, (file, text) =>
      file.endsWith('.md') ? text.replace('| `id` |', '| `identifier` |') : text,
    );
    expect(drifted.ok).toBe(false);
    expect(drifted.output).toContain('is stale');
  }, 60_000);

  it('accepts a CRLF copy of the portable template JSON Schema and still flags drift', () => {
    const files = ['docs/generated/portable-template-pack.schema.json'];
    expect(runCheckOnACrlfCopy('scripts/generate-portable-template-json-schema.ts', files)).toEqual({ ok: true, output: '' });

    const drifted = runCheckOnACrlfCopy('scripts/generate-portable-template-json-schema.ts', files, (_, text) =>
      text.replace('"title"', '"heading"'),
    );
    expect(drifted.ok).toBe(false);
    expect(drifted.output).toContain('out of date');
  }, 60_000);
});
