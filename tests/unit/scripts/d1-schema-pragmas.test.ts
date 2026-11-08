import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, describe, expect, it } from 'vitest';

import {
  mapForeignKeyPragmaResults,
  mapPragmaResults,
  mapTriggerResults,
  splitSchemaQueryResults,
} from '../../../scripts/lib/d1-schema-pragmas';
import { readSqlOnlySchema } from '../../../scripts/lib/sql-only-schema';

const folder = mkdtempSync(path.join(tmpdir(), 'sql-only-schema-'));
afterAll(() => rmSync(folder, { recursive: true, force: true }));

describe('reading what Wrangler answered', () => {
  it('refuses an answer that is not a list of result sets', () => {
    expect(() => splitSchemaQueryResults(['users'], { error: 'not authorized' })).toThrow(
      'Wrangler returned no result sets; expected 4 result sets.',
    );
  });

  it('reads a table Wrangler answered nothing for as having no columns, and skips rows of another shape', () => {
    expect(mapPragmaResults(['users', 'runs'], [{ results: [{ name: 'id' }, { cid: 1 }] }, 'Error: no such table'])).toEqual({
      users: ['id'],
      runs: [],
    });
  });

  it('reads a foreign key with no target column or delete action as empty ones', () => {
    expect(mapForeignKeyPragmaResults(['runs'], [{ results: [{ from: 'team_id', table: 'teams', to: null, on_delete: null }] }])).toEqual({
      runs: [{ from: 'team_id', table: 'teams', to: '', onDelete: '' }],
    });
  });

  it('reads a trigger with no table as one on no table', () => {
    expect(mapTriggerResults({ results: [{ name: 'runs_touch', tbl_name: null, sql: 'CREATE TRIGGER runs_touch' }] })).toEqual({
      runs_touch: { table: '', definition: 'CREATE TRIGGER runs_touch' },
    });
  });
});

describe('readSqlOnlySchema', () => {
  it('reads the checked-in triggers', () => {
    expect(readSqlOnlySchema().triggers.length).toBeGreaterThan(0);
  });

  it('names the first field a malformed manifest gets wrong', () => {
    const manifest = path.join(folder, 'sql-only-schema.json');
    writeFileSync(manifest, JSON.stringify({ version: 1, description: 'x', triggers: [{ name: 'runs_touch', table: 'runs' }] }));

    expect(() => readSqlOnlySchema(manifest)).toThrow(
      'db/sql-only-schema.json must list triggers as { name, table, definition } strings (triggers.0.definition: Required).',
    );
  });
});
