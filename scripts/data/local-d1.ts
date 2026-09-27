import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "../../db/schema/index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

function createLocalDb(binding: D1Database) {
  return drizzle(binding, { schema });
}

export type LocalDb = ReturnType<typeof createLocalDb>;

export async function withLocalD1<T>(
  persistPath: string | undefined,
  operation: (db: LocalDb) => Promise<T>,
): Promise<T> {
  const platform = await getPlatformProxy<{ DB: D1Database }>({
    configPath: path.join(repoRoot, "wrangler.toml"),
    // Wrangler 4.54 treats [] as permission to load .dev.vars, so use an
    // explicit missing file to disable both .dev.vars and default .env files.
    envFiles: [".local-d1-env-disabled"],
    persist: persistPath ? { path: path.resolve(repoRoot, persistPath, "v3") } : true,
    remoteBindings: false,
  });

  try {
    return await operation(createLocalDb(platform.env.DB));
  } finally {
    await platform.dispose();
  }
}
