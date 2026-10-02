import { vi } from 'vitest';

type GuardedInsertModule = typeof import('@functions/api/utils/guarded-insert');
type InsertRowWhere = GuardedInsertModule['insertRowWhere'];

export async function guardedInsertsThroughThePlainInsertMock(importOriginal: <T>() => Promise<T>) {
  return {
    ...(await importOriginal<GuardedInsertModule>()),
    insertRowWhere: vi.fn<InsertRowWhere>((db, table, values) => db.insert(table).values(values)),
  };
}
