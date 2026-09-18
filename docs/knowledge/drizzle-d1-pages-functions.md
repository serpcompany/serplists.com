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
- Drizzle owns every database object it can represent: tables, columns,
  defaults, constraints, foreign keys, and indexes.
- SQL migrations in `db/migrations/` remain the ordered D1 migration history.
- SQL-only objects that Drizzle cannot represent, currently sitemap triggers,
  are recorded in `db/sql-only-schema.json`.

Verify those contracts against fresh isolated databases after changing either
one:

```bash
pnpm run check:db:drizzle-parity
```

The check does not access Staging or Production.

## Drizzle Kit config
- `db/drizzle.config.ts` uses the SQLite dialect to generate migrations without Cloudflare credentials.
- Drizzle Kit generates migration files; the explicit Wrangler Local, Staging, and Production commands apply them to D1.
- The historical migration set does not yet include Drizzle snapshot metadata,
  so `db:generate` currently proposes a fresh baseline migration that must not
  be applied or committed.

## Notes
- Keep API responses in snake_case to avoid breaking the current frontend mapping.
- JSON fields (items, tags, category) stay as text and are parsed in handlers.
