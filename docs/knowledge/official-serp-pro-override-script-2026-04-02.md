# Official `serp` Pro override script (2026-04-02)

> Historical record: the legacy executable is now blocked for both reads and
> writes. Do not run it directly. Production access belongs to the protected
> workflow in [Protected data promotion](../operations/protected-data-promotion.md),
> including its guarded identity, ledger, and report steps. There is no
> supported local production-read shortcut.

The official publisher account can be upgraded to Pro without Stripe by writing a manual override row into `entitlement_overrides`.

The retired one-off operational script was:

- [scripts/set-official-serp-plan.mjs](/Users/devin/dev/repos/serplists.com/scripts/set-official-serp-plan.mjs)

It was intentionally hard-scoped to:

- user id `serp-user`
- username `serp`
- email `checklists@serp.co`

Historical behavior:

- inspects the live D1 plan override state for the official account
- when run with `--execute`, upserts a row in `entitlement_overrides`
- supports `pro` and `free`, but is intended mainly for official publisher recovery/debugging
- re-reads live state after the change

Historical usage (disabled):

```bash
SERP_PLAN=pro pnpm run billing:set:official:serp -- --execute
```

Historical read-only inspection (disabled):

```bash
pnpm run billing:set:official:serp
```

Expected follow-up verification:

1. Sign in at `https://serplists.com/login`
2. Call `GET /api/billing/status` with the authenticated session
3. Confirm the response shows `"plan":"pro"`
