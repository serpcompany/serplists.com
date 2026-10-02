import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { getPlatformProxy, type PlatformProxy } from "wrangler";
import { NO_DEV_VARS_OR_DOTENV_FILES } from "../../scripts/data/local-d1";
import { execTool, REPO_ROOT } from "../../scripts/lib/run-tool.mjs";
import { apiEnv } from "../support/apiEnv";
import type { Env } from "@functions/api/types";

export type LocalD1 = {
  env: Env;
  dispose: () => Promise<void>;
};

export function runToolInRepo(tool: "tsx" | "wrangler", args: string[]): string {
  return execTool(tool, args, {
    cwd: REPO_ROOT,
    env: { ...process.env, CI: "1" },
    encoding: "utf8",
    stdio: ["ignore", "pipe", "pipe"],
  }) as string;
}

export function platformProxyOnLocalD1<Env>(persistPath: string): Promise<PlatformProxy<Env>> {
  return getPlatformProxy<Env>({
    configPath: path.join(REPO_ROOT, "wrangler.toml"),
    envFiles: NO_DEV_VARS_OR_DOTENV_FILES,
    persist: { path: path.resolve(REPO_ROOT, persistPath, "v3") },
    remoteBindings: false,
  });
}

export async function startLocalD1(tempDirectoryPrefix: string): Promise<LocalD1> {
  const persistPath = mkdtempSync(path.join(tmpdir(), `serplists-${tempDirectoryPrefix}-`));
  runToolInRepo("wrangler", ["d1", "migrations", "apply", "serp-checklists-db", "--local", "--persist-to", persistPath]);
  let platform: PlatformProxy<{ DB: D1Database }>;
  try {
    platform = await platformProxyOnLocalD1<{ DB: D1Database }>(persistPath);
  } catch (error) {
    rmSync(persistPath, { recursive: true, force: true });
    throw error;
  }

  return {
    env: apiEnv({ DB: platform.env.DB, BETTER_AUTH_SECRET: "local-d1-better-auth-secret-32-chars!!" }),
    dispose: async () => {
      await platform.dispose();
      rmSync(persistPath, { recursive: true, force: true });
    },
  };
}
