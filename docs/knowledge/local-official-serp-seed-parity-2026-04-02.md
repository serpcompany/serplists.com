# Local official SERP seed parity (2026-04-02)

The repo's official publisher fixture now lives in `db/seeds/data/official-templates.json` and is applied through the typed Drizzle module in `db/seeds/index.ts`; the default local `db:reset` flow includes it.

That created an avoidable mismatch:

- local public templates imported in dev were owned by `admin`
- local `/profile/serp/...` routes were not testable after a normal reset
- JSON round-trip testing in VS Code did not reflect the intended official publisher identity

Fix applied:

- added `pnpm run db:seed:official:local`
- updated `pnpm run db:reset` to run the official local seed after the normal local seed
- added a local-only companion seed so `serp-user` can log in with the standard dev password
- added `SERP (Pro)` to the dev login helpers
- documented that local resets now restore the official `serp` publisher records

Result:

- local resets now have better parity for public-template ownership and route testing
- local imports can now be performed under the real `serp` publisher identity
- official publisher workflows can be tested locally without relying on remote data
