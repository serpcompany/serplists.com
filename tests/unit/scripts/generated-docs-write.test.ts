import { mkdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { REPO_ROOT } from '../../../scripts/lib/run-tool';
import { aFolderIn } from '../../support/foldersOfFiles';
import { runRepositoryScript } from '../../support/repositoryScriptRun';
import { aWorkDirRemovedAfterAll } from '../../support/workflowGuards';

const workDir = aWorkDirRemovedAfterAll('generated-docs-');
const committed = (file: string) => readFileSync(path.join(REPO_ROOT, file), 'utf8').replace(/\r\n/g, '\n');
const written = (folder: string, file: string) => readFileSync(path.join(folder, file), 'utf8');

describe('pnpm run db:schema:generate', { timeout: 60_000 }, () => {
  it('writes docs/api/db-schema.md as the committed copy holds it, which --check then accepts', () => {
    const checkout = aFolderIn(workDir, { 'db/sql-only-schema.json': committed('db/sql-only-schema.json') });
    mkdirSync(path.join(checkout, 'docs', 'api'), { recursive: true });

    const generated = runRepositoryScript('scripts/generate-db-schema-doc.ts', [], { cwd: checkout });

    expect(generated.status).toBe(0);
    expect(generated.stdout).toMatch(/^Wrote docs\/api\/db-schema\.md \(\d+ tables\)\n$/);
    expect(written(checkout, 'docs/api/db-schema.md')).toBe(committed('docs/api/db-schema.md'));
    expect(runRepositoryScript('scripts/generate-db-schema-doc.ts', ['--check'], { cwd: checkout }).stdout).toContain('docs/api/db-schema.md is up to date');
  });
});

describe('pnpm run schema:portable:generate', { timeout: 60_000 }, () => {
  const schemaPath = 'docs/api/portable-template-pack.schema.json';

  it('writes the portable template JSON Schema as the committed copy holds it, making its folder, which --check then accepts', () => {
    const checkout = aFolderIn(workDir);

    const generated = runRepositoryScript('scripts/generate-portable-template-json-schema.ts', [], { cwd: checkout });

    expect(generated.status).toBe(0);
    expect(generated.stdout.trim()).toBe(`Wrote ${schemaPath}`);
    expect(written(checkout, schemaPath)).toBe(committed(schemaPath));
    expect(runRepositoryScript('scripts/generate-portable-template-json-schema.ts', ['--check'], { cwd: checkout }).status).toBe(0);
  });

  it('fails --check when the schema was never generated', () => {
    const result = runRepositoryScript('scripts/generate-portable-template-json-schema.ts', ['--check'], { cwd: aFolderIn(workDir) });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain(`Portable template JSON Schema artifact is out of date: ${schemaPath}`);
  });

  it('fails with the reason when the schema path cannot be read for a reason other than being missing', () => {
    const checkout = aFolderIn(workDir);
    mkdirSync(path.join(checkout, schemaPath), { recursive: true });

    const result = runRepositoryScript('scripts/generate-portable-template-json-schema.ts', [], { cwd: checkout });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain('EISDIR');
  });
});
