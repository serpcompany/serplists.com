import { describe, expect, it } from 'vitest';

import { diffD1Schema, diffD1Triggers, formatSchemaDrift, hasSchemaDrift, normalizeSqlFormatting } from '../../../scripts/lib/d1-schema-drift';

const requiredColumns = { runs: ['id', 'name', 'team_id'], teams: ['id'], audit: ['id'] };
const actualColumns = { runs: ['id', 'name', 'team_id'], teams: ['id'] };

describe('diffD1Schema', () => {
  it('finds no drift in a database that has every table and column, with nothing else required', () => {
    const diff = diffD1Schema({ runs: ['id'] }, { runs: ['id', 'extra'] });

    expect(hasSchemaDrift(diff)).toBe(false);
  });

  it('reports every way a database can drift from the schema, and checks nothing more on a missing table', () => {
    const diff = diffD1Schema(
      { ...requiredColumns, runs: [...requiredColumns.runs, 'archived_at'] },
      actualColumns,
      {
        runs: [
          { name: 'runs_team_idx', unique: false, partial: true },
          { name: 'runs_name_unique', unique: true, partial: false },
          { name: 'runs_gone_idx' },
        ],
        teams: [{ name: 'teams_slug_idx', unique: false }],
        audit: [{ name: 'audit_idx' }],
        notes: [{ name: 'notes_idx' }],
      },
      { runs: { runs_team_id_idx: { unique: true, partial: false }, runs_name_unique: { unique: false, partial: true } } },
      { runs: { id: { primaryKey: true }, name: { notNull: true }, team_id: { notNull: true }, gone: { notNull: true } }, audit: { id: { primaryKey: true } }, notes: {} },
      { runs: { id: { notNull: false, primaryKey: false }, name: { notNull: false, primaryKey: false }, team_id: { notNull: true, primaryKey: false } } },
      {
        runs: [
          { from: 'team_id', table: 'teams', to: 'id', onDelete: 'cascade' },
          { from: 'owner_id', table: 'users', to: 'id' },
        ],
        teams: [{ from: 'owner_id', table: 'users', to: 'id' }],
        audit: [{ from: 'run_id', table: 'runs', to: 'id' }],
      },
      { runs: [{ from: 'team_id', table: 'teams', to: 'id', onDelete: 'SET NULL' }] },
    );

    expect(diff).toEqual({
      missingTables: ['audit'],
      missingColumns: { runs: ['archived_at'] },
      missingIndexes: { runs: ['runs_team_idx', 'runs_gone_idx'], teams: ['teams_slug_idx'], notes: ['notes_idx'] },
      invalidIndexes: { runs: [{ name: 'runs_name_unique', issues: ['expected unique', 'expected non-partial'] }] },
      invalidColumns: {
        runs: [
          { name: 'id', issues: ['expected primary key'] },
          { name: 'name', issues: ['expected NOT NULL'] },
        ],
      },
      missingForeignKeys: { runs: ['owner_id->users.id'], teams: ['owner_id->users.id'] },
      invalidForeignKeys: { runs: [{ name: 'team_id->teams.id', issues: ['expected ON DELETE CASCADE'] }] },
    });
    expect(hasSchemaDrift(diff)).toBe(true);
    expect(formatSchemaDrift(diff, 'serplists-production').split('\n')).toEqual([
      'D1 schema drift detected for serplists-production.',
      '- missing table: audit',
      '- runs: missing columns archived_at',
      '- runs: missing indexes runs_team_idx, runs_gone_idx',
      '- teams: missing indexes teams_slug_idx',
      '- notes: missing indexes notes_idx',
      '- runs: invalid index runs_name_unique (expected unique; expected non-partial)',
      '- runs: invalid column id (expected primary key)',
      '- runs: invalid column name (expected NOT NULL)',
      '- runs: missing foreign keys owner_id->users.id',
      '- teams: missing foreign keys owner_id->users.id',
      '- runs: invalid foreign key team_id->teams.id (expected ON DELETE CASCADE)',
      'Apply the required checked-in D1 migrations before deploying.',
    ]);
  });

  it('reads an index that became unique or partial, or stopped being partial, as drift', () => {
    const diff = diffD1Schema(
      { runs: ['id'] },
      { runs: ['id'] },
      { runs: [{ name: 'runs_idx', unique: false, partial: false }, { name: 'runs_open_idx', partial: true }] },
      { runs: { runs_idx: { unique: true, partial: true }, runs_open_idx: { unique: false, partial: false } } },
    );

    expect(diff.invalidIndexes).toEqual({
      runs: [
        { name: 'runs_idx', issues: ['expected non-unique', 'expected non-partial'] },
        { name: 'runs_open_idx', issues: ['expected partial'] },
      ],
    });
  });
});

describe('diffD1Triggers', () => {
  const definition = 'CREATE TRIGGER runs_touch AFTER UPDATE ON runs BEGIN SELECT 1; END';

  it('accepts a trigger whose definition differs only in quoting and spacing', () => {
    const diff = diffD1Triggers([{ name: 'runs_touch', table: 'runs', definition }], {
      runs_touch: { table: 'runs', definition: normalizeSqlFormatting('CREATE TRIGGER "runs_touch"  AFTER UPDATE ON `runs`\n BEGIN SELECT 1; END') },
    });

    expect(diff).toEqual({ missingTriggers: [], invalidTriggers: [] });
  });

  it('reports a missing trigger, and one on another table or with another definition', () => {
    const diff = diffD1Triggers(
      [
        { name: 'runs_touch', table: 'runs', definition },
        { name: 'teams_touch', table: 'teams', definition: 'CREATE TRIGGER teams_touch' },
        { name: 'audit_touch', table: 'audit', definition: 'CREATE TRIGGER audit_touch' },
      ],
      { teams_touch: { table: '', definition: 'CREATE TRIGGER teams_touch' }, audit_touch: { table: 'audit', definition: 'CREATE TRIGGER other' } },
    );

    expect(hasSchemaDrift({ ...diffD1Schema({}, {}), ...diff })).toBe(true);
    expect(formatSchemaDrift({ ...diffD1Schema({}, {}), ...diff }, 'local').split('\n').slice(1, -1)).toEqual([
      '- missing trigger: runs_touch',
      '- invalid trigger teams_touch (expected on teams, found on no table)',
      '- invalid trigger audit_touch (definition differs from db/sql-only-schema.json)',
    ]);
  });

  it('reads a missing definition as an empty one', () => {
    expect(normalizeSqlFormatting(null)).toBe('');
  });
});
