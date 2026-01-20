# Vitest exclude defaults

If you override `test.exclude` in `vitest.config.ts`, include `**/node_modules/**` (and other common patterns) explicitly. Otherwise Vitest may start collecting tests from dependencies.

Current config excludes:
- `**/node_modules/**`
- `**/dist/**`
- `**/playwright-report/**`
- `**/test-results/**`
- `tests/e2e/**` (Playwright)
