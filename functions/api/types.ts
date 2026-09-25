/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  BETTER_AUTH_SECRET?: string;
  AUTH_EMAIL_VERIFICATION_REQUIRED?: "true" | "false";
  PERSONAL_RUN_MCP_ENABLED?: "true" | "false";
  FRONTEND_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;

  // Stripe billing (required to ship Pro/paid)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_PRICE_ID?: string;
  STRIPE_PORTAL_CONFIGURATION_ID?: string;
  ENTITLEMENTS_ADMIN_SECRET?: string;
  RESEND_API_KEY?: string;
  USESEND_API_KEY?: string;
  EMAIL_FROM?: string;

  // R2 uploads
  R2_UPLOADS: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
}
