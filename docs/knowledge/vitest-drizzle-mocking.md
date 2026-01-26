# Mocking Drizzle D1 in Vitest

## Context
Unit tests for Pages Functions that use `createDb(env)` can stub Drizzle at the adapter layer so handlers keep using real schema + query expressions.

## Approach
- Mock `drizzle-orm/d1` to return a chainable fake DB.
- Use `vi.hoisted` so mocks exist before the module under test is imported.
- Set `limit.mockResolvedValueOnce([...])` per test for select results.

Example:
```ts
const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const insertChain = { values: vi.fn() };
  const db = { select: vi.fn(() => selectChain), insert: vi.fn(() => insertChain) };
  return { selectChain, insertChain, db };
});

vi.mock('drizzle-orm/d1', () => ({
  drizzle: vi.fn(() => dbMocks.db)
}));
```
