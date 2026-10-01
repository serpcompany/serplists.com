import path from "node:path";
import { fileURLToPath } from "node:url";
import { drizzle } from "drizzle-orm/d1";
import { getPlatformProxy } from "wrangler";
import type { D1Database } from "@cloudflare/workers-types";
import * as schema from "../../db/schema/index";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
export const NO_DEV_VARS_OR_DOTENV_FILES = [".local-d1-env-disabled"];

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
    envFiles: NO_DEV_VARS_OR_DOTENV_FILES,
    persist: persistPath ? { path: path.resolve(repoRoot, persistPath, "v3") } : true,
    remoteBindings: false,
  });

  try {
    return await operation(createLocalDb(platform.env.DB));
  } finally {
    await platform.dispose();
  }
}
