import { z } from "zod";
import { describeFrontendUrlProblem, describeOriginListProblem } from "./utils/origin-list";

const refineWith = (describe: (value: string) => string | null) => (value: string, ctx: z.RefinementCtx) => {
  const problem = describe(value);
  if (problem) ctx.addIssue({ code: z.ZodIssueCode.custom, message: problem });
};

export const API_ENV_SCHEMA = {
  JWT_SECRET: z.string().min(1).optional(),
  BETTER_AUTH_SECRET: z.string().min(1).optional(),
  AUTH_EMAIL_VERIFICATION_REQUIRED: z.enum(["true", "false"]).optional(),
  PERSONAL_RUN_MCP_ENABLED: z.enum(["true", "false"]).optional(),
  R2_PUBLIC_BASE_URL: z.string().url().optional(),
  FRONTEND_URL: z.string().superRefine(refineWith(describeFrontendUrlProblem)).optional(),
  CORS_ALLOWED_ORIGINS: z.string().superRefine(refineWith(describeOriginListProblem)).optional(),
  STRIPE_SECRET_KEY: z.string().min(1).optional(),
  STRIPE_WEBHOOK_SECRET: z.string().min(1).optional(),
  STRIPE_PRO_PRICE_ID: z.string().min(1).optional(),
  STRIPE_PRO_LEGACY_PRICE_IDS: z.string().min(1).optional(),
  STRIPE_PORTAL_CONFIGURATION_ID: z.string().min(1).optional(),
  ENTITLEMENTS_ADMIN_SECRET: z.string().min(8).optional(),
  RESEND_API_KEY: z.string().min(1).optional(),
  USESEND_API_KEY: z.string().min(1).optional(),
  EMAIL_FROM: z.string().min(1).optional(),
};
