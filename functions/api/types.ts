/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  JWT_SECRET?: string;
  BETTER_AUTH_SECRET: string;
  FRONTEND_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;

  // Stripe billing (required to ship Pro/paid)
  STRIPE_SECRET_KEY?: string;
  STRIPE_WEBHOOK_SECRET?: string;
  STRIPE_PRO_PRICE_ID?: string;

  // R2 uploads
  R2_UPLOADS: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
}
