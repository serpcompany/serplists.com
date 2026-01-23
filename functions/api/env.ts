import { createEnv } from "@t3-oss/env-core";
import { z } from "zod";
import type { Env } from "./types";

export const getApiEnv = (env: Env) => {
  return createEnv({
    server: {
      JWT_SECRET: z.string().min(1).optional(),
      BETTER_AUTH_SECRET: z.string().min(32),
      R2_PUBLIC_BASE_URL: z.string().url().optional(),
      FRONTEND_URL: z.string().url().optional(),
      CORS_ALLOWED_ORIGINS: z.string().min(1).optional(),
    },
    runtimeEnv: {
      JWT_SECRET: env.JWT_SECRET,
      BETTER_AUTH_SECRET: env.BETTER_AUTH_SECRET,
      R2_PUBLIC_BASE_URL: env.R2_PUBLIC_BASE_URL,
      FRONTEND_URL: env.FRONTEND_URL,
      CORS_ALLOWED_ORIGINS: env.CORS_ALLOWED_ORIGINS,
    },
    emptyStringAsUndefined: true,
  });
};
