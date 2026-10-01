import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

import { findPreviewD1BindingProblem } from '../../../scripts/check-preview-d1-binding-lib.mjs';
import { readD1Databases } from '../../../scripts/d1-baseline-migrations-lib.mjs';

const repoRoot = process.cwd();

type Ids = { production?: string | undefined; preview?: string | undefined; previewDeployment?: string | undefined };

const inlineTable = (fields: Record<string, string | undefined>) =>
  `{ ${Object.entries(fields)
    .flatMap(([name, value]) => (value === undefined ? [] : [`${name} = '${value}'`]))
    .join(', ')} }`;

const wranglerToml = ({ production, preview, previewDeployment }: Ids, databasesListedFirst: string[] = []) => {
  const app = inlineTable({ binding: 'DB', database_id: production, preview_database_id: preview });
  const previewDeploymentLine =
    previewDeployment === undefined
      ? []
      : [`env.preview.d1_databases = [${inlineTable({ binding: 'DB', database_id: previewDeployment })}]`];
  return [`d1_databases = [${[...databasesListedFirst, app].join(', ')}]`, ...previewDeploymentLine].join('\n');
};

const problemIn = (toml: string) => findPreviewD1BindingProblem(readD1Databases(toml));

const separate: Ids = { production: 'prod-1', preview: 'staging-1', previewDeployment: 'staging-1' };

describe('the preview D1 binding check', () => {
  it('passes wrangler.toml as committed, from the command line too', () => {
    expect(problemIn(readFileSync(path.join(repoRoot, 'wrangler.toml'), 'utf8'))).toBeNull();

    const run = spawnSync(process.execPath, ['scripts/check-preview-d1-binding.mjs'], { cwd: repoRoot, encoding: 'utf8' });
    expect(run.status).toBe(0);
    expect(run.stdout).toContain('Preview D1 binding points at a separate database.');
  });

  it('reads the ids as TOML, in single quotes and inline tables, which a line pattern for double quotes missed', () => {
    expect(problemIn(wranglerToml(separate))).toBeNull();
  });

  it.each([
    [{ ...separate, production: undefined }, 'missing the production D1 database_id'],
    [{ ...separate, preview: undefined }, 'must set preview_database_id'],
    [{ ...separate, preview: '<staging-d1-uuid>' }, 'must set preview_database_id'],
    [{ ...separate, preview: 'prod-1', previewDeployment: 'prod-1' }, 'preview_database_id must not match the production'],
    [{ ...separate, previewDeployment: undefined }, 'must set [[env.preview.d1_databases]] database_id'],
    [{ ...separate, previewDeployment: '<staging-d1-uuid>' }, 'must set [[env.preview.d1_databases]] database_id'],
    [{ ...separate, previewDeployment: 'prod-1' }, 'must match preview_database_id'],
  ])('refuses %o', (ids, refusal) => {
    expect(problemIn(wranglerToml(ids))).toContain(refusal);
  });

  it('reads the app binding DB, not whichever D1 database is listed first', () => {
    const analytics = inlineTable({ binding: 'ANALYTICS', database_id: 'prod-1', preview_database_id: 'prod-1' });

    expect(problemIn(wranglerToml(separate, [analytics]))).toBeNull();
  });
});
