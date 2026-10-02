import { vi } from 'vitest';

export function drizzleChainMocks() {
  const selectChain = { from: vi.fn(), leftJoin: vi.fn(), where: vi.fn(), orderBy: vi.fn(), limit: vi.fn() };
  const insertChain = { values: vi.fn(), select: vi.fn(), onConflictDoNothing: vi.fn() };
  const updateChain = { set: vi.fn(), where: vi.fn(), returning: vi.fn() };
  const deleteChain = { where: vi.fn() };
  const db = {
    select: vi.fn((_fields?: unknown) => selectChain),
    insert: vi.fn((_table?: unknown) => insertChain),
    update: vi.fn((_table?: unknown) => updateChain),
    delete: vi.fn((_table?: unknown) => deleteChain),
    batch: vi.fn(),
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
