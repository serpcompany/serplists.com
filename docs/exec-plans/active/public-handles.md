# Public handles

- **Status:** active
- **Last updated:** 2026-10-05
- **Goal:** Users and Organizations share one case-insensitive namespace of public handles, so
  `/profile/:handle` can later serve either without choosing by lookup order (issue #233; it
  unblocks #232, #207 and #237).

## Progress

- [x] Read-only collision check of staging D1 (`pnpm run check:public-handles:staging`,
  2026-10-05): 6 usernames and Organization slugs, no collisions, none outside the rule.
- [x] PR 1 (#280): the shared handle rule, the collision check script, migration `0028` (the
  `public_handles` registry, its backfill and six triggers on `users` and `teams`), and the API
  answering a registry conflict as it answers the per-table unique indexes.
- [x] `0028` applied to staging (2026-10-05, owner go-ahead): collision check rerun first (0 of
  6), Time Travel bookmark `00000ab2-00000000-000050fb-bd7954aae6b6ac1af0b53fa7ab762d76`
  noted, `verify:staging` passes, 4 User and 2 Organization handles registered, and the
  staging deploy ran.
- [ ] PR 2: the rule on the inputs: usernames also accept `-`, and Organization slugs accept the
  full rule (uppercase, `_` and `.`) with 30 characters at most instead of 120. Migration
  `0029` gives the sitemap's user triggers `-` too.
- [ ] Apply `0029` to staging (owner go-ahead at that step).
- [ ] Production: the collision check, a backup, `0028` and `0029`, each after a separate
  owner go-ahead.

## Decision log

- 2026-10-04 (owner, on #233): one rule for Users and Organizations, 3 to 30 letters, digits,
  `_`, `.` and `-`, compared without regard to case. Collisions are renamed by hand, never
  automatically. Archived Organizations keep their handle. The collision check and `0028` go to
  local and staging only; production waits.
- 2026-10-05 (owner): two PRs: everything the database needs first, then the rule on the
  inputs. Organization slugs take the full rule, not a lowercase subset.
- 2026-10-05: Triggers keep the registry, not app code. Better Auth writes usernames itself and
  D1 has batches, not interactive transactions, so a claim made in a handler could not be
  atomic with Better Auth's write. A trigger's failed insert rolls back the write that fired it
  and its whole batch, on every path.
- 2026-10-05: The key is `lower(trim(value))`, matching the existing sitemap triggers' `TRIM`.
  `normalizePublicHandle` mirrors SQLite exactly (ASCII letters only, spaces only), and a test
  compares the two.
- 2026-10-05: Values saved before the rule (an Organization slug over 30 characters, a legacy
  mixed-case username) are registered as they are, and the collision check lists them. Only a
  collision stops the backfill, so `0028` refuses to run on a database the check would fail.
- 2026-10-05: Two Users whose usernames differ only in case can no longer both exist, which
  `idx_users_username` (case-sensitive) allowed. The profile lookup's exact-match preference
  stays for legacy mixed-case usernames.
- 2026-10-05: Clearing a username or deleting a User or Organization frees its handle;
  archiving changes no slug, so an archived Organization keeps its own.
- 2026-10-05: Allowing `-` in usernames needs migration `0029`: `0023`'s sitemap triggers on
  `users` match `[A-Za-z0-9_.]` in SQL, so without it a hyphenated username would never refresh
  the cached profile sitemaps. `0029` drops and recreates those four triggers with `-` added;
  the code-side sitemap check is `isPublicHandle` itself.
- 2026-10-05: Organization slugs are kept as typed (the full rule allows capitals) and compared
  without regard to case, like the registry. A name-derived slug stays lowercase, truncated to
  30 characters, and falls back to `team-<id8>` when the name gives fewer than 3.
