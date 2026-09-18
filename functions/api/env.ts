import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import type { Env } from "./types";
import { resolveAuthSecret } from "./utils/auth-secret";

export const getApiEnv = (env: Env) => {
  const parsedEnv = createEnv({
    server: {
      JWT_SECRET: z.string().min(1).optional(),
      BETTER_AUTH_SECRET: z.string().min(1).optional(),
      AUTH_EMAIL_VERIFICATION_REQUIRED: z.enum(["true", "false"]).optional(),
      PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
      R2_PUBLIC_BASE_URL: z.string().url().optional(),
      FRONTEND_URL: z.string().url().optional(),
      CORS_ALLOWED_ORIGINS: z.string().min(1).optional(),
      STRIPE_SECRET_KEY: z.string().min(1).optional(),
      STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
      STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
      ENTITLEMENTS_ADMIN_SECRET: z.string().min(8).optional(),
      RESEND_API_KEY: z.string().min(1).optional(),
      USESEND_API_KEY: z.string().min(1).optional(),
      EMAIL_FROM: z.string().min(1).optional(),
    },
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
      ENTITLEMENTS_ADMIN_SECRET: env.ENTITLEMENTS_ADMIN_SECRET,
      RESEND_API_KEY: env.RESEND_API_KEY,
      USESEND_API_KEY: env.USESEND_API_KEY,
      EMAIL_FROM: env.EMAIL_FROM,
    },
    emptyStringAsUndefined: true,
  });

  // Fail fast if neither the current nor legacy auth secret is usable.
  resolveAuthSecret({
    BETTER_AUTH_SECRET: parsedEnv.BETTER_AUTH_SECRET,
    JWT_SECRET: parsedEnv.JWT_SECRET,
  });

  return parsedEnv;
};
