import { mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import { lintSingleTemplateSource, lintTemplatePair, lintYamlTemplateBundle } from '@/../scripts/lib/templateLint';

// A Windows clone with core.autocrlf=true checks the example templates out with CRLF.
// The linter must compare them with the LF canonical output by content, not bytes.

const examplesRoot = path.join(process.cwd(), 'docs/product-specs/portable-templates/examples');
const toCrlf = (text: string) => text.replace(/\r?\n/g, '\r\n');

let tempRoot = '';

const copyAsCrlf = (example: string, edit: (file: string, text: string) => string = (_, text) => text) => {
  const target = path.join(tempRoot, `${example}-${Math.random().toString(36).slice(2)}`);
  mkdirSync(target, { recursive: true });
  for (const file of readdirSync(path.join(examplesRoot, example))) {
    const text = readFileSync(path.join(examplesRoot, example, file), 'utf8');
    writeFileSync(path.join(target, file), toCrlf(edit(file, text)));
  }
  return target;
};

const lintBundle = (dir: string) =>
  lintYamlTemplateBundle(path.join(dir, 'template.yaml'), {
    jsonPath: path.join(dir, 'template.json'),
    markdownPath: path.join(dir, 'template.md'),
    readmePath: path.join(dir, 'README.md'),
    previewHtmlPath: path.join(dir, 'preview.html'),
  });

describe('templateLint on CRLF files', () => {
  beforeAll(() => {
    tempRoot = mkdtempSync(path.join(tmpdir(), 'serplists-template-eol-'));
  });

  afterAll(() => {
    rmSync(tempRoot, { recursive: true, force: true });
  });

  it.each(['minimal', 'full'])('accepts a CRLF checkout of the %s example', async (example) => {
    const dir = copyAsCrlf(example);

    expect(await lintBundle(dir)).toEqual([]);
    expect(await lintTemplatePair(path.join(dir, 'template.json'), path.join(dir, 'template.md'))).toEqual([]);
    for (const file of ['template.yaml', 'template.json', 'template.md']) {
      expect(await lintSingleTemplateSource(path.join(dir, file))).toEqual([]);
    }
  });

  it('still reports real drift in a CRLF artifact', async () => {
    const dir = copyAsCrlf('minimal', (file, text) => {
      if (file !== 'template.json') return text;
      const parsed = JSON.parse(text) as { title: string };
      return text.replace(JSON.stringify(parsed.title), JSON.stringify(`${parsed.title} (edited)`));
    });

    const codes = (await lintBundle(dir)).map((issue) => issue.code);
    expect(codes).toEqual(['json-not-generated']);
  });
});
