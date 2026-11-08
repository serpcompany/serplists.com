import { is } from 'drizzle-orm';
import { getTableConfig, SQLiteTable } from 'drizzle-orm/sqlite-core';
import { describe, expect, it } from 'vitest';
import { z } from 'zod';

import * as schema from '../../../db/schema/index';
import { SqliteD1 } from '../../support/sqlite-d1';

type ForeignKey = { table: string; column: string; references: string; onDelete: string };

const describeKey = (key: ForeignKey) => `${key.table}.${key.column} -> ${key.references} on delete ${key.onDelete}`;

const drizzleTables: SQLiteTable[] = Object.values(schema).flatMap((value) => (is(value, SQLiteTable) ? [value] : []));

const keysTheDrizzleSchemaDeclares = (): string[] =>
  drizzleTables.flatMap((table) => {
    const config = getTableConfig(table);
    return config.foreignKeys.flatMap((foreignKey) => {
      const reference = foreignKey.reference();
      const target = getTableConfig(reference.foreignTable).name;
      return reference.columns.map((column, index) =>
        describeKey({
          table: config.name,
          column: column.name,
          references: `${target}.${reference.foreignColumns[index]?.name ?? ''}`,
          onDelete: (foreignKey.onDelete ?? 'no action').toUpperCase(),
        }),
      );
    });
  }).sort();

const pragmaForeignKey = z.object({ table: z.string(), from: z.string(), to: z.string(), on_delete: z.string() });

const keysTheMigrationsCreate = (): string[] => {
  const database = new SqliteD1();
  return drizzleTables.flatMap((table) => {
    const name = getTableConfig(table).name;
    return database.sqlite
      .prepare(`SELECT * FROM pragma_foreign_key_list('${name}')`)
      .all()
      .map((row) => pragmaForeignKey.parse(row))
      .map((row) => describeKey({ table: name, column: row.from, references: `${row.table}.${row.to}`, onDelete: row.on_delete }));
  }).sort();
};

describe('the Drizzle schema foreign keys', () => {
  it('match the foreign keys the migrations create, column for column, with the same delete rule', () => {
    const declared = keysTheDrizzleSchemaDeclares();

    expect(declared).toContain('checklist_runs.template_id -> templates.id on delete SET NULL');
    expect(declared).toEqual(keysTheMigrationsCreate());
  });
});
