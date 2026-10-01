import { vi } from 'vitest';

type GuardedInsertModule = typeof import('@functions/api/utils/guarded-insert');

export async function guardedInsertsThroughThePlainInsertMock(importOriginal: <T>() => Promise<T>) {
  return {
    ...(await importOriginal<GuardedInsertModule>()),
    insertRowWhere: vi.fn((db: any, table: unknown, values: unknown) => db.insert(table).values(values)),
  };
}
