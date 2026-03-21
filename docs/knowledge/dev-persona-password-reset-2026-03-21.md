# Dev persona password reset (2026-03-21)

## Problem
Local seeded personas (`admin@test.com`, `john@test.com`, `jane@test.com`, `bob@test.com`) all start with `password123`, but Better Auth blocks common/compromised passwords on change. Once a persona password changed away from `password123`, the docs and quick-login helpers still advertised the old password with no easy recovery path.

## Fix
- Added `pnpm run db:reset:test-user-passwords`, which reapplies the seeded bcrypt hash to both `users.password_hash` and the Better Auth `account.password` credential rows for the four local test users.
- Centralized the dev persona metadata in `src/lib/auth/devUsers.ts`.
- Updated the login page and dev login bar to point to the reset command instead of implying `password123` is always still valid.

## Verified flow
1. Signed in locally as Bob with `password123`.
2. Changed Bob's password to a strong value.
3. Signed out and confirmed the new strong password worked.
4. Ran `pnpm run db:reset:test-user-passwords`.
5. Signed back in as Bob with `password123`.

