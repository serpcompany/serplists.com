import { vi } from 'vitest';

interface InsertedValues extends Record<string, unknown> {
  action?: unknown;
}

const guardedInserts = vi.hoisted(() => [] as Array<{ values: InsertedValues; condition: unknown }>);

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@functions/api/utils/guarded-insert')>()),
  insertRowWhere: vi.fn((_db: unknown, _table: unknown, values: InsertedValues, condition: unknown) => {
    guardedInserts.push({ values, condition });
    return { guardedInsert: values.action };
  }),
}));

export { guardedInserts };
