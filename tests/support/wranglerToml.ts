import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { parse } from "smol-toml";
import { z } from "zod";

const wranglerTomlPath = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../wrangler.toml");

const deployedVars = z
  .object({
    SITE_ENV: z.enum(["staging", "production"]),
    AUTH_EMAIL_VERIFICATION_REQUIRED: z.enum(["true", "false"]),
    PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]),
    CORS_ALLOWED_ORIGINS: z.string(),
  })
  .catchall(z.string());

const d1Database = z
  .object({ binding: z.string(), database_name: z.string(), database_id: z.string() })
  .passthrough();

const deployedEnvironment = z
  .object({ vars: deployedVars, d1_databases: z.array(d1Database) })
  .passthrough();

const wranglerConfig = z
  .object({
    vars: z.record(z.string()),
    d1_databases: z.array(d1Database),
    env: z.object({ preview: deployedEnvironment, production: deployedEnvironment }).passthrough(),
  })
  .passthrough();

export type WranglerEnvironment = "preview" | "production";

export function readWranglerToml() {
  return wranglerConfig.parse(parse(readFileSync(wranglerTomlPath, "utf8")));
}

export function wranglerEnvVars(environment: WranglerEnvironment) {
  return readWranglerToml().env[environment].vars;
}
