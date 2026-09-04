# Official `serp` live password reset script (2026-04-02)

> Historical record: the legacy executable is now blocked for both reads and
> writes. Do not run it directly. Production access belongs to the protected
> workflow in [Protected data promotion](../operations/protected-data-promotion.md),
> including its guarded identity, ledger, and report steps. There is no
> supported local production-read shortcut.

The official publisher account on `serplists.com` is a real Better Auth credential user, not just a public profile row.

That means a usable non-UI reset has to update both places the current app reads password state:

- `users.password_hash`
- `account.password` for the `credential` account

The retired one-off operational script was:

- [scripts/reset-official-serp-password.mjs](/Users/devin/dev/repos/serplists.com/scripts/reset-official-serp-password.mjs)

It was intentionally hard-scoped to:

- user id `serp-user`
- username `serp`
- email `checklists@serp.co`

Historical behavior:

- inspects the live D1 auth state for the official account
- when run with `--execute`, hashes the supplied password with bcrypt cost `10`
- updates both auth hash locations
- marks `email_verified = 1`
- clears active sessions
- re-reads live state after the change

Operational note:

- `wrangler d1 execute --remote --command` accepted the multi-statement reset batch, but rejected explicit `BEGIN TRANSACTION` / `COMMIT` wrappers in this environment.
- The script therefore sends the official reset as a single multi-statement batch without explicit transaction keywords.

Historical usage (disabled):

```bash
SERP_RESET_PASSWORD='your-strong-password' pnpm run auth:reset:official:serp -- --execute
```

Historical read-only inspection (disabled):

```bash
pnpm run auth:reset:official:serp
```

Expected follow-up verification:

1. Sign in at `https://serplists.com/login`
2. Use `checklists@serp.co`
3. Confirm login succeeds without `INVALID_EMAIL_OR_PASSWORD`
4. Confirm login succeeds without `EMAIL_NOT_VERIFIED`

This was an operational recovery path for the official publisher account, not a reusable admin feature. It is no longer an available production access path.
