# Account username save fix (2026-02-22)

## Issue
- In Account settings, updating username appeared to save but did not persist after refresh.

## Root cause
- UI called `authClient.username.updateUser(...)`, but the Better Auth username client plugin does not expose a `username.updateUser` API.
- Username updates should go through `authClient.updateUser({ username })`.

## Fix
- Switched username save path to `authClient.updateUser` with a single merged payload (`name`, `image`, `username`).
- Added explicit error handling for `result.error` so failed updates are surfaced immediately.
- Added no-op guard toast when there are no changes.

## Verification
- Unit test added: `tests/unit/pages/accountProfileUpdates.test.ts`
- Build/lint/typecheck passed.
- Production deploy completed on `main` branch:
  - `ede74c31-7bb5-4e65-9d6b-77f78d3e1ce9`
