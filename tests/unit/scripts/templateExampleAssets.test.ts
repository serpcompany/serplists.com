import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { lintSingleTemplateSource, lintYamlTemplateBundle } from '@/../scripts/lib/templateLint';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');

const issuesInTheExampleBundle = async (name: string) => {
  const baseDir = path.join(repoRoot, 'docs/product-specs/portable-templates/examples', name);
  return [
    ...(await lintYamlTemplateBundle(path.join(baseDir, 'template.yaml'), {
      jsonPath: path.join(baseDir, 'template.json'),
      markdownPath: path.join(baseDir, 'template.md'),
      readmePath: path.join(baseDir, 'README.md'),
      previewHtmlPath: path.join(baseDir, 'preview.html'),
    })),
  ];
};

describe('template example assets', () => {
  it('keeps the minimal example assets valid and synced', async () => {
    expect(await issuesInTheExampleBundle('minimal')).toEqual([]);
  });

  it('keeps the full example assets valid and synced', async () => {
    expect(await issuesInTheExampleBundle('full')).toEqual([]);
  });

  it('keeps standalone yaml example source valid', async () => {
    const issues = await lintSingleTemplateSource(path.join(repoRoot, 'docs/product-specs/portable-templates/examples/full/template.yaml'));
    expect(issues).toEqual([]);
  });
});
