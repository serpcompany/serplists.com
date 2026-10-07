import { createEnv } from "@t3-oss/env-core";
import type { Env } from "./types";
import { resolveAuthSecret } from "./utils/auth-secret";
import { API_ENV_SCHEMA } from "./env-schema";

export const getApiEnv = (env: Env) => {
  const parsedEnv = createEnv({
    server: API_ENV_SCHEMA,
    runtimeEnv: {
      JWT_SECRET: env.JWT_SECRET,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      AUTH_EMAIL_VERIFICATION_REQUIRED: env.AUTH_EMAIL_VERIFICATION_REQUIRED,
      PERSONAL_RUN_MCP_ENABLED: env.PERSONAL_RUN_MCP_ENABLED,
      R2_PUBLIC_BASE_URL: env.R2_PUBLIC_BASE_URL,
      FRONTEND_URL: env.FRONTEND_URL,
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS,
      STRIPE_SECRET_KEY: env.STRIPE_SECRET_KEY,
      STRIPE_WEBHOOK_SECRET: env.STRIPE_WEBHOOK_SECRET,
      STRIPE_PRO_PRICE_ID: env.STRIPE_PRO_PRICE_ID,
      STRIPE_PRO_LEGACY_PRICE_IDS: env.STRIPE_PRO_LEGACY_PRICE_IDS,
      STRIPE_PORTAL_CONFIGURATION_ID: env.STRIPE_PORTAL_CONFIGURATION_ID,
      ENTITLEMENTS_ADMIN_SECRET: env.ENTITLEMENTS_ADMIN_SECRET,
      RESEND_API_KEY: env.RESEND_API_KEY,
      USESEND_API_KEY: env.USESEND_API_KEY,
      EMAIL_FROM: env.EMAIL_FROM,
    },
    emptyStringAsUndefined: true,
  });

  resolveAuthSecret({
    BETTER_AUTH_SECRET: parsedEnv.BETTER_AUTH_SECRET,
    JWT_SECRET: parsedEnv.JWT_SECRET,
  });

  return parsedEnv;
};
