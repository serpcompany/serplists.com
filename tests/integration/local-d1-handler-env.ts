import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { getPlatformProxy, type PlatformProxy } from "wrangler";

// A throwaway local D1 with every migration applied, for calling API handlers against
// real SQL (no dev server). Each call gets its own temp directory.

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");

export type LocalD1HandlerEnv = { DB: D1Database; BETTER_AUTH_SECRET: string };

export type LocalD1 = {
  env: LocalD1HandlerEnv;
  dispose: () => Promise<void>;
};

export async function startLocalD1(prefix: string): Promise<LocalD1> {
  const persistPath = mkdtempSync(path.join(tmpdir(), `serplists-${prefix}-`));
  execFileSync("pnpm", [
    "exec", "wrangler", "d1", "migrations", "apply", "serp-checklists-db", "--local", "--persist-to", persistPath,
  ], {
    cwd: repoRoot,
    env: { ...process.env, CI: "1" },
    stdio: "pipe",
  });
  let platform: PlatformProxy<{ DB: D1Database }>;
  try {
    platform = await getPlatformProxy<{ DB: D1Database }>({
      configPath: path.join(repoRoot, "wrangler.toml"),
      envFiles: [".local-d1-env-disabled"],
      persist: { path: path.resolve(repoRoot, persistPath, "v3") },
      remoteBindings: false,
    });
  } catch (error) {
    rmSync(persistPath, { recursive: true, force: true });
    throw error;
  }

  return {
    env: { DB: platform.env.DB, BETTER_AUTH_SECRET: "local-d1-better-auth-secret-32-chars!!" },
    dispose: async () => {
      await platform.dispose();
      rmSync(persistPath, { recursive: true, force: true });
    },
  };
}
