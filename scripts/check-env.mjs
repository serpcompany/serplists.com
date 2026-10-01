import { readFileSync, existsSync } from "node:fs";
import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import { describeFrontendUrlProblem, describeOriginListProblem } from "./lib/origin-list.mjs";

const parseEnvFile = (path) => {
  if (!existsSync(path)) return {};
  const contents = readFileSync(path, "utf8");
  const entries = {};
  for (const line of contents.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const idx = trimmed.indexOf("=");
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx).trim();
    const rawValue = trimmed.slice(idx + 1).trim();
    const value = rawValue.replace(/^['"]|['"]$/g, "");
    entries[key] = value;
  }
  return entries;
};

const hasNonCommentEnvEntries = (path) => {
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

const refineLikeTheApi = (describeProblem) => (value, ctx) => {
  const problem = describeProblem(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
};

createEnv({
  server: {
    JWT_SECRET: z.string().min(1).optional(),
    BETTER_AUTH_SECRET: z.string().min(1).optional(),
    SITE_ENV: z.enum(["production", "staging"]).optional(),
    AUTH_EMAIL_VERIFICATION_REQUIRED: z.enum(["true", "false"]).optional(),
    PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
    NEXT_PUBLIC_PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
    NEXT_PUBLIC_API_URL: z.string().url().optional(),
    R2_PUBLIC_BASE_URL: z.string().url().optional(),
    FRONTEND_URL: z.string().superRefine(refineLikeTheApi(describeFrontendUrlProblem)).optional(),
    CORS_ALLOWED_ORIGINS: z.string().superRefine(refineLikeTheApi(describeOriginListProblem)).optional(),
    STRIPE_SECRET_KEY: z.string().min(1).optional(),
    STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
    STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
    STRIPE_PRO_LEGACY_PRICE_IDS: z.string().min(1).optional(),
    STRIPE_PORTAL_CONFIGURATION_ID: z.string().min(1).optional(),
    ENTITLEMENTS_ADMIN_SECRET: z.string().min(8).optional(),
    RESEND_API_KEY: z.string().min(1).optional(),
    USESEND_API_KEY: z.string().min(1).optional(),
    EMAIL_FROM: z.string().min(1).optional(),
  },
  runtimeEnv,
  emptyStringAsUndefined: true,
});

const normalizeSecret = (value) => {
  if (!value) return null;
  const trimmed = String(value).trim();
  return trimmed.length ? trimmed : null;
};

const betterAuthSecret = normalizeSecret(runtimeEnv.BETTER_AUTH_SECRET);
const jwtSecret = normalizeSecret(runtimeEnv.JWT_SECRET);

const hasValidBetterAuthSecret = betterAuthSecret && betterAuthSecret.length >= 32;
const hasValidJwtSecret = jwtSecret && jwtSecret.length >= 32;

if (!hasValidBetterAuthSecret && !hasValidJwtSecret) {
  throw new Error("A 32+ char BETTER_AUTH_SECRET (or legacy JWT_SECRET) is required");
}

console.log("env ok");
