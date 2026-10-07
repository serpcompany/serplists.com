import { vi } from 'vitest';
import type { StoredRow } from './d1Doubles';

const guardedInserts = vi.hoisted(() => [] as Array<{ values: StoredRow; condition: unknown }>);

vi.mock('@functions/api/utils/guarded-insert', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@functions/api/utils/guarded-insert')>()),
  insertRowWhere: vi.fn((_db: unknown, _table: unknown, values: StoredRow, condition: unknown) => {
    guardedInserts.push({ values, condition });
    return { guardedInsert: values.action };
  }),
}));

export { guardedInserts };
