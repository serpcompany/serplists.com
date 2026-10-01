import { vi } from 'vitest';

const guardedInserts = vi.hoisted(() => [] as Array<{ values: Record<string, unknown>; condition: unknown }>);

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@functions/api/utils/guarded-insert')>()),
  insertRowWhere: vi.fn((_db: unknown, _table: unknown, values: Record<string, unknown>, condition: unknown) => {
    guardedInserts.push({ values, condition });
    return { guardedInsert: values.action };
  }),
}));

export { guardedInserts };
