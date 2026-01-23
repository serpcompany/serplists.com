/// <reference types="@cloudflare/workers-types" />

export interface Env {
  DB: D1Database;
  JWT_SECRET: string;
  FRONTEND_URL?: string;
  CORS_ALLOWED_ORIGINS?: string;

  // R2 uploads
  R2_UPLOADS: R2Bucket;
  R2_PUBLIC_BASE_URL?: string;
}
