import { vi } from 'vitest';
import type { StoredRow } from './d1Doubles';

type ChainStep = (...args: unknown[]) => unknown;
type Condition = (condition: unknown) => unknown;

export function drizzleChainMocks() {
  const selectChain = {
    from: vi.fn<ChainStep>(),
    leftJoin: vi.fn<ChainStep>(),
    where: vi.fn<Condition>(),
    orderBy: vi.fn<ChainStep>(),
    limit: vi.fn<(count: number) => unknown>(),
  };
  const insertChain = { values: vi.fn<(row: StoredRow) => unknown>(), select: vi.fn<ChainStep>(), onConflictDoNothing: vi.fn<ChainStep>() };
  const updateChain = { set: vi.fn<(values: StoredRow) => unknown>(), where: vi.fn<Condition>(), returning: vi.fn<ChainStep>() };
  const deleteChain = { where: vi.fn<Condition>() };
  const db = {
    select: vi.fn((_fields?: unknown) => selectChain),
    insert: vi.fn((_table?: unknown) => insertChain),
    update: vi.fn((_table?: unknown) => updateChain),
    delete: vi.fn((_table?: unknown) => deleteChain),
    batch: vi.fn<(statements: unknown[]) => unknown>(),
  };
  return { selectChain, insertChain, updateChain, deleteChain, db };
}

export type DrizzleChainMocks = ReturnType<typeof drizzleChainMocks>;

export function chainSelectsUpdatesAndDeletes({ selectChain, updateChain, deleteChain }: DrizzleChainMocks) {
  for (const step of [selectChain.from, selectChain.leftJoin, selectChain.where]) step.mockReturnValue(selectChain);
  updateChain.set.mockReturnValue(updateChain);
  updateChain.where.mockReturnValue(updateChain);
  deleteChain.where.mockReturnValue(deleteChain);
}

export const EVERY_GUARDED_WRITE_APPLIED = [{ meta: { changes: 1 } }, { meta: { changes: 1 } }];

export function dropQueuedRowsAndBatchResults({ selectChain, db }: DrizzleChainMocks) {
  for (const queue of [selectChain.orderBy, selectChain.limit, db.batch]) queue.mockReset();
}

export function resetChainsToEmptyResults(mocks: DrizzleChainMocks) {
  dropQueuedRowsAndBatchResults(mocks);
  chainSelectsUpdatesAndDeletes(mocks);
  mocks.selectChain.orderBy.mockResolvedValue([]);
  mocks.selectChain.limit.mockResolvedValue([]);
  mocks.insertChain.values.mockResolvedValue(undefined);
  mocks.insertChain.select.mockReturnValue({ kind: 'conditional-insert' });
  mocks.deleteChain.where.mockResolvedValue(undefined);
  mocks.db.batch.mockResolvedValue([]);
}
