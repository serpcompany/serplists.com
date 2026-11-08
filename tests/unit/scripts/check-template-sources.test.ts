import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { LAUNCH_JSON, LAUNCH_YAML } from '../../fixtures/templateSourceFiles';
import { stringContaining } from '../../support/asymmetricMatchers';
import { aFolderIn } from '../../support/foldersOfFiles';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('check-template-sources-');
const UNREADABLE = 'not: [a template';

const templatesCheck = (args: string[], cwd?: string) =>
  runRepositoryScript('scripts/check-template-sources.ts', args, cwd === undefined ? {} : { cwd });

function aGeneratedYamlBundle(yamlName: string): string {
  const folder = aFolderIn(workDir, { [yamlName]: LAUNCH_YAML });
  expect(runRepositoryScript('scripts/generate-template-assets.ts', [path.join(folder, yamlName)]).status).toBe(0);
  return folder;
}

const issueLines = (stderr: string) => stderr.split('\n').filter(Boolean);

describe('pnpm templates:check on a YAML bundle', { timeout: 60_000 }, () => {
  it.each(['template.yaml', 'template.yml'])('accepts %s with the files templates:generate wrote from it', (yamlName) => {
    const result = templatesCheck([aGeneratedYamlBundle(yamlName)]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Template sources OK (5 files checked)');
  });

  it('accepts a YAML source before anything is generated from it', () => {
    const result = templatesCheck([aFolderIn(workDir, { 'template.yaml': LAUNCH_YAML })]);

    expect(result.stdout.trim()).toBe('Template sources OK (1 file checked)');
  });

  it('names each generated file edited by hand, and exits 1', () => {
    const folder = aGeneratedYamlBundle('template.yaml');
    for (const file of ['README.md', 'preview.html', 'template.md', 'template.json']) {
      writeFileSync(path.join(folder, file), `${readFileSync(path.join(folder, file), 'utf8')}\nEdited by hand.\n`);
    }

    const result = templatesCheck([folder]);

    expect(result.status).toBe(1);
    expect(issueLines(result.stderr)).toEqual([
      `${path.join(folder, 'template.json')}: [json-not-generated] JSON artifact should be regenerated from template.yaml`,
      `${path.join(folder, 'README.md')}: [readme-not-generated] README preview should be regenerated from template.yaml`,
      `${path.join(folder, 'preview.html')}: [preview-html-not-generated] HTML preview should be regenerated from template.yaml`,
      `${path.join(folder, 'template.md')}: [markdown-not-generated] Strict Markdown artifact should be regenerated from template.yaml`,
    ]);
  });
});

describe('pnpm templates:check on JSON and Markdown sources', { timeout: 60_000 }, () => {
  it('checks a template.json and template.md together as one pair', () => {
    const folder = aFolderIn(workDir, { 'template.json': LAUNCH_JSON });
    expect(runRepositoryScript('scripts/render-template-markdown.ts', [path.join(folder, 'template.json')]).status).toBe(0);
    writeFileSync(path.join(folder, 'template.md'), readFileSync(path.join(folder, 'template.md'), 'utf8').replace('Review content', 'Review the copy'));

    const result = templatesCheck([folder]);

    expect(result.status).toBe(1);
    expect(issueLines(result.stderr).map((line) => /\[([a-z-]+)\]/.exec(line)?.[1])).toEqual(['json-markdown-drift', 'markdown-not-generated']);
  });

  it('checks a lone template.json on its own, and counts one file', () => {
    const folder = aFolderIn(workDir, { 'template.json': LAUNCH_JSON });

    expect(templatesCheck([folder]).stdout.trim()).toBe('Template sources OK (1 file checked)');
  });

  it('reports a lone source it cannot read, and a preview.html without the YAML it comes from', () => {
    const folder = aFolderIn(workDir, { 'template.md': UNREADABLE, 'nested/preview.html': '<p>orphan</p>' });

    const result = templatesCheck([folder]);

    expect(result.status).toBe(1);
    expect(issueLines(result.stderr)).toEqual([
      `${path.join(folder, 'nested', 'preview.html')}: [unsupported-file-type] Unsupported template source file type`,
      stringContaining(`${path.join(folder, 'template.md')}: [parse-error] `),
    ]);
  });
});

describe('what pnpm templates:check looks at', { timeout: 60_000 }, () => {
  it('checks the current folder when given none, leaving out dependency, build and tool folders and READMEs beside no YAML', () => {
    const folder = aFolderIn(workDir, {
      'checklists/launch/template.json': LAUNCH_JSON,
      'checklists/launch/README.md': 'Notes about the launch checklist.',
      'node_modules/a-package/template.md': UNREADABLE,
      'coverage/template.json': UNREADABLE,
      '.claude/template.yaml': UNREADABLE,
      'notes.md': UNREADABLE,
    });

    const result = templatesCheck([], folder);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Template sources OK (1 file checked)');
  });

  it('checks a template file it is named directly, skips any other file, and skips an excluded folder it is named', () => {
    const folder = aFolderIn(workDir, { 'launch/template.json': LAUNCH_JSON, 'launch/notes.txt': UNREADABLE, 'dist/template.md': UNREADABLE });

    const result = templatesCheck([path.join(folder, 'launch', 'template.json'), path.join(folder, 'launch', 'notes.txt'), path.join(folder, 'dist')]);

    expect(result.status).toBe(0);
    expect(result.stdout.trim()).toBe('Template sources OK (1 file checked)');
  });

  it('fails with the reason when a path it is given does not exist', () => {
    const missing = path.join(workDir, 'no-such-folder');

    const result = templatesCheck([missing]);

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('ENOENT');
    expect(result.stderr).toContain('no-such-folder');
  });
});
