# Route and query runtime coverage

The local data gate discovers semantic execution units directly from `functions/**` on every run. A source fingerprint or named Playwright scenario is inventory context only; neither can satisfy a runtime unit.

## Units

- An **endpoint unit** is a handler branch whose condition dispatches on the request method, route path, or handler subpath. Nested branches in one handler are separate units.
- A **query unit** is one awaited or async-returned D1/Drizzle execution. The test-only transform records success only after the original thenable resolves. A Drizzle `db.batch(...)` is one D1 execution unit; its lazy statement builders are deliberately not executed or marked separately before the batch succeeds.
- A local helper that returns a lazy Drizzle builder is treated as an adapter. Its consuming awaited chain is the runtime unit. Construction of the builder is not evidence because it may never execute.

Unit IDs hash the repository-relative source path, owning function, normalized semantic expression, and duplicate index. A digest of the complete discovered unit set binds every runtime fragment to the exact checked source as well as the existing commit and migration identity. Whitespace, comments, route parameters, SQL parameters, and customer values are absent from evidence. Reports retain only the static source digest, each unit ID, kind, status, and aggregate counts.

## Test-only boundary

`createRouteQueryInstrumentationPlugin` transforms only `functions/**` in the isolated test bundle. The bundle installs `createRouteQueryRuntime()` and exposes its snapshot through a harness-owned test endpoint. Application source and production bundles have no coverage endpoint or recorder.

The transform wraps the original lazy operation in a thunk, awaits it exactly once, returns the original result, records success after resolution, and rethrows the original error. Focused parity tests protect against eager or double execution. Worker tests use an actual D1 binding; API and database response mocks are prohibited.

Better Auth's package-internal SQL is outside repository source discovery. The gate still covers the repository endpoint branch and repository calls into that adapter through real Better Auth login journeys. Outbound Stripe transport is also an adapter boundary; its local protocol double does not replace Worker or D1 behavior. These boundaries do not exempt any discovered repository unit.

## Exclusions

There are currently no exclusions. Any future exclusion must name one exact discovered unit ID, use the bounded `package-adapter`, `outbound-provider`, or `unrouted-module` boundary, and include specific proof. Unknown IDs, stale exclusions, missing proof, runtime-only IDs, failed queries, and unexecuted units fail the gate.
