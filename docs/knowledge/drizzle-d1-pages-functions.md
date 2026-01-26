# Drizzle ORM with Cloudflare D1 (Pages Functions)

## Runtime usage
- Use `drizzle-orm/d1` with the D1 binding.
- Create a small helper in `functions/api/db.ts` and pass `env.DB`.

Example:
```ts
import { drizzle } from "drizzle-orm/d1";
import * as schema from "../../db/schema/index";

export const createDb = (env: Env) => drizzle(env.DB, { schema });
```

## Schema location
- Drizzle schema lives in `db/schema/index.ts`.
- SQL migrations remain in `db/migrations/` (current source of truth).

## Drizzle Kit config
- `db/drizzle.config.ts` targets D1 via `driver: "d1-http"`.
- Requires `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_DATABASE_ID`, `CLOUDFLARE_D1_TOKEN`.

## Notes
- Keep API responses in snake_case to avoid breaking the current frontend mapping.
- JSON fields (items, tags, category) stay as text and are parsed in handlers.
