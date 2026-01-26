# Env validation (Vite + Cloudflare Pages Functions)

## Vite client env
- Use `@t3-oss/env-core` with `clientPrefix: "VITE_"` and `runtimeEnv: import.meta.env`.
- Keep variables optional unless they are required for startup.
- Set `emptyStringAsUndefined: true` to avoid empty-string edge cases.

Example:
```ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const env = createEnv({
  clientPrefix: "VITE_",
  client: {
    VITE_API_URL: z.string().url().optional(),
  },
  runtimeEnv: import.meta.env,
  emptyStringAsUndefined: true,
});
```

## Pages Functions env
- Validate string bindings (`BETTER_AUTH_SECRET`, optional URLs) with `createEnv`.
- Non-string bindings (D1 `DB`, R2 buckets) are not validated by t3-env.
- Local dev requires `BETTER_AUTH_SECRET` in `.dev.vars`; missing values cause `wrangler pages dev` to 500 on `/api/*`.

Example:
```ts
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";

export const getApiEnv = (env: Env) => createEnv({
  server: {
    BETTER_AUTH_SECRET: z.string().min(32),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
    FRONTEND_URL: z.string().url().optional(),
  },
  runtimeEnv: {
    BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
    R2_PUBLIC_BASE_URL: env.R2_PUBLIC_BASE_URL,
    FRONTEND_URL: env.FRONTEND_URL,
  },
  emptyStringAsUndefined: true,
});
```
