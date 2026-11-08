import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LAUNCH_JSON, LAUNCH_PACK_YAML, LAUNCH_TEMPLATE, LAUNCH_YAML } from '../../fixtures/templateSourceFiles';
import { aFolderIn } from '../../support/foldersOfFiles';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('template-asset-generators-');
const aFolderHolding = (files: Record<string, string>) => aFolderIn(workDir, files);

const read = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');

describe('pnpm templates:generate', { timeout: 60_000 }, () => {
  it('writes the JSON, strict Markdown, README and HTML preview beside the YAML, in the forms templates:check accepts', () => {
    const folder = aFolderHolding({ 'template.yaml': LAUNCH_YAML });

    const generated = runRepositoryScript('scripts/generate-template-assets.ts', [path.join(folder, 'template.yaml')], { cwd: folder });

    expect(generated.status).toBe(0);
    expect(generated.stdout.split('\n').filter(Boolean)).toEqual(
      ['template.json', 'template.md', 'README.md', 'preview.html'].map((file) => `Wrote /${file}`),
    );
    expect(read(folder, 'template.json')).toBe(LAUNCH_JSON);
    expect(read(folder, 'template.md')).toContain('Review content');
    expect(read(folder, 'README.md')).toContain('Launch Checklist');
    expect(read(folder, 'preview.html')).toContain('Read every page once.');
    expect(runRepositoryScript('scripts/check-template-sources.ts', [folder]).stdout).toContain('Template sources OK (5 files checked)');
  });

  it('writes into the output folder it is given, making it when missing', () => {
    const folder = aFolderHolding({ 'template.yaml': LAUNCH_YAML });
    const output = path.join(folder, 'generated', 'launch');

    const generated = runRepositoryScript('scripts/generate-template-assets.ts', ['template.yaml', output], { cwd: folder });

    expect(generated.status).toBe(0);
    expect(['template.json', 'template.md', 'README.md', 'preview.html'].filter((file) => existsSync(path.join(output, file)))).toHaveLength(4);
    expect(existsSync(path.join(folder, 'template.json'))).toBe(false);
  });

  it.each([
    ['no YAML file', () => [], 'Usage: pnpm tsx scripts/generate-template-assets.ts <template.yaml> [output-dir]'],
    ['a folder', () => [workDir], `Input path is not a file: ${workDir}`],
    [
      'a template pack',
      () => [path.join(aFolderHolding({ 'pack.yaml': LAUNCH_PACK_YAML }), 'pack.yaml')],
      'Template asset generation expects a single-template YAML source, not a template pack',
    ],
  ])('refuses %s and exits 1', (_case, args, message) => {
    const generated = runRepositoryScript('scripts/generate-template-assets.ts', args());

    expect(generated.status).toBe(1);
    expect(generated.stderr).toContain(message);
  });
});

describe('pnpm templates:render-markdown', { timeout: 60_000 }, () => {
  it('writes template.md beside the JSON by default, which templates:check accepts as its pair', () => {
    const folder = aFolderHolding({ 'template.json': LAUNCH_JSON });

    const rendered = runRepositoryScript('scripts/render-template-markdown.ts', ['template.json'], { cwd: folder });

    expect(rendered.status).toBe(0);
    expect(rendered.stdout.trim()).toBe('Wrote template.md');
    expect(runRepositoryScript('scripts/check-template-sources.ts', [], { cwd: folder }).stdout).toContain('Template sources OK (2 files checked)');
  });

  it('writes the Markdown to the path it is given, making its folder', () => {
    const folder = aFolderHolding({ 'launch.json': JSON.stringify(LAUNCH_TEMPLATE) });

    const rendered = runRepositoryScript('scripts/render-template-markdown.ts', ['launch.json', path.join('out', 'launch.md')], { cwd: folder });

    expect(rendered.status).toBe(0);
    expect(read(folder, path.join('out', 'launch.md'))).toContain('# Launch Checklist');
  });

  it.each([
    ['no JSON file', () => [], 'For the YAML-first workflow use: pnpm templates:generate <template.yaml>'],
    ['a folder', () => [workDir], `Input path is not a file: ${workDir}`],
  ])('refuses %s and exits 1', (_case, args, message) => {
    const rendered = runRepositoryScript('scripts/render-template-markdown.ts', args());

    expect(rendered.status).toBe(1);
    expect(rendered.stderr).toContain(message);
  });
});
