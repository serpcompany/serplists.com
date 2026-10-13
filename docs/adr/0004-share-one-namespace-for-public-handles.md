---
status: accepted
---

# Share one namespace for public handles

Users and Organizations take their public handles from one namespace, compared without regard to
case, so `/profile/:handle` names exactly one Profile Owner, a User or an Organization. A handle
is 3 to 30 letters, digits, `_`, `.` and `-`. The `public_handles` table in D1 holds every
handle by its key, `lower(trim(value))`, and triggers on `users` and `teams` keep it, so a User's
username and an Organization's slug can never collide.

Decided by the owner on 2026-10-04 in #233, built in #280 and #281 (migrations `0028` and
`0029`), and applied to production on 2026-10-07.

## Why

- **One URL family for both owners.** Organization Public Profiles (#232) and their Templates
  live at `/profile/:handle` and `/profile/:handle/:slug`, beside the Users'. With two namespaces,
  a handle held by both would be resolved by lookup order, and a new Organization could take the
  URL a User's links already point at.
- **Atomic claims without transactions.** Better Auth writes usernames itself, and D1 has batches,
  not interactive transactions, so a claim made in a handler couldn't be atomic with that write.
  A trigger's failed insert rolls back the write that fired it, and its whole batch, on every
  path.

## Considered

- **Separate paths per owner type,** such as `/org/:slug`: no collisions, but two URL families
  for one kind of page, and every link would have to know the owner's type.
- **Resolving a shared path by lookup order,** Users first: an Organization could be shadowed by a
  later User, or the reverse.
- **Claims in application code:** not atomic with Better Auth's own writes.

## Consequences

- Two Users whose usernames differ only in case can no longer both exist. Values saved before the
  rule, such as a legacy mixed-case username, are registered as they are.
- Collisions are renamed by hand, never automatically: before `0028` reached production, the
  Organizations `serp` and `devinschumacher`, which Users also held, became `serp-team` and
  `devinschumacher-team`. `pnpm run check:public-handles:prod` lists collisions, read-only.
- Organization slugs take the full rule, at most 30 characters, kept as typed. Clearing a username
  or deleting a User or Organization frees its handle; an archived Organization keeps its own.
- Console routes don't use handles: they name an Organization by its id
  ([ADR 0001](0001-use-personal-and-organization-ownership-contexts.md)).
- How the registry and its triggers work is in
  [`database-operations.md`](../agents/database-operations.md#public-handle-registry).
