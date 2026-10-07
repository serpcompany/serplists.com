import { readFileSync, existsSync } from "node:fs";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { parseEnvFile } from "./lib/env-file";
import { API_ENV_SCHEMA } from "../functions/api/env-schema";

const hasNonCommentEnvEntries = (path: string) => {
  if (!existsSync(path)) return false;
  const contents = readFileSync(path, "utf8");
  return contents
    .split("\n")
    .map((line) => line.trim())
    .some((line) => line && !line.startsWith("#"));
};

const deprecatedEnvFiles = [".env", ".env.local"];
for (const deprecatedFile of deprecatedEnvFiles) {
  if (hasNonCommentEnvEntries(deprecatedFile)) {
    throw new Error(
      `${deprecatedFile} is deprecated. Use .dev.vars as the single local env file.`
    );
  }
}

const fileEnv = parseEnvFile(".dev.vars");
const runtimeEnv = { ...fileEnv, ...process.env };

const forbiddenLiveKeys = Object.keys(fileEnv).filter((key) => key.endsWith("_LIVE"));
const liveStripeValues = Object.entries(fileEnv)
  .filter(([, value]) => value.startsWith("sk_live_"))
  .map(([key]) => key);
if (forbiddenLiveKeys.length > 0 || liveStripeValues.length > 0) {
  throw new Error(
    `.dev.vars must contain local/test values only; remove: ${[
      ...new Set([...forbiddenLiveKeys, ...liveStripeValues]),
    ].join(", ")}`,
  );
}

createEnv({
  server: {
    ...API_ENV_SCHEMA,
    SITE_ENV: z.enum(["production", "staging"]).optional(),
    NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
  },
  runtimeEnv,
  emptyStringAsUndefined: true,
});

const normalizeSecret = (value: string | undefined) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const betterAuthSecret = normalizeSecret(runtimeEnv["BETTER_AUTH_SECRET"]);
const jwtSecret = normalizeSecret(runtimeEnv["JWT_SECRET"]);

const hasValidBetterAuthSecret = betterAuthSecret && betterAuthSecret.length >= 32;
const hasValidJwtSecret = jwtSecret && jwtSecret.length >= 32;

if (!hasValidBetterAuthSecret && !hasValidJwtSecret) {
  throw new Error("A 32+ char BETTER_AUTH_SECRET (or legacy JWT_SECRET) is required");
}

console.log("env ok");
