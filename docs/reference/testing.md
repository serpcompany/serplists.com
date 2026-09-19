# Testing

Use the smallest relevant command while developing and run the repository
quality gates before merging. The command inventory and Playwright local-origin
contract live in [Development](../getting-started/development-setup.md).

## Vitest configuration

- Coverage configuration lives under `test.coverage` in `vitest.config.ts`.
- `@vitest/coverage-v8` must match the installed Vitest major/minor version.
- Run coverage with `pnpm run test:coverage`.
- If `test.exclude` is overridden, retain `**/node_modules/**`, `**/dist/**`,
  `**/playwright-report/**`, `**/test-results/**`, and `tests/e2e/**`.
- Keep scratch paths such as `tmp/**` excluded so local mirrors do not add
  duplicate tests to collection.

## Mocking Drizzle D1

Pages Function unit tests can mock `drizzle-orm/d1` at the adapter boundary
while handlers continue using real schema and query expressions. Create mocks
with `vi.hoisted`, return a chainable fake DB from `drizzle`, and configure the
terminal operation (for example, `limit.mockResolvedValueOnce`) per test.

```ts
const dbMocks = vi.hoisted(() => {
  const selectChain = { from: vi.fn(), where: vi.fn(), limit: vi.fn() };
  const insertChain = { values: vi.fn() };
  const db = {
    select: vi.fn(() => selectChain),
    insert: vi.fn(() => insertChain),
  };
  return { selectChain, insertChain, db };
});

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));
```

Call `vi.clearAllMocks()` in `beforeEach()` when hoisted chains are reused, so
insert/update assertions cannot read history from another test.

## Contract-test maintenance

Handler tests should assert the public contract, not incidental query order.
Request the legacy template backup explicitly with `?format=backup`; the
default export is portable. When route behavior changes intentionally, update
old ordering assumptions rather than reverting the current contract to satisfy
a mock.

## Environment safety

- Run smoke and E2E suites against local workers or dedicated staging, never
  production endpoints.
- Reuse stable test identities instead of registering a new account on every
  run.
- Production auth blocks known test-email domains; keep that coverage when
  authentication routes change.
- If production test accounts must be removed, inspect dependent rows first
  and clean related auth, templates, runs, likes, analytics, entitlement, and
  Stripe records as one deliberate maintenance operation.
