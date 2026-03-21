# Release verification: handler test drift after API contract changes

- `GET /api/templates/backup` now defaults to the portable export format.
- Tests that need the legacy backup payload must request `?format=backup`.
- Template clone handler checks the free-plan template count before loading the public source template.
- Template-share handler loads the source template before checking active-run limits when entitlements are mocked at the module boundary.
- Handler unit tests that reuse hoisted Drizzle mocks should call `vi.clearAllMocks()` in `beforeEach()` so insert/update assertions do not accidentally read call history from earlier tests.

Why this matters:

- Release verification can fail even when the runtime behavior is correct if unit tests keep the old route/query order assumptions.
- The fix is to align tests with the current contract, not to revert the newer portable export or share/copy behavior.
