import { z } from "zod";
import type { Env } from "../types";

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  proPriceId: string;
};

export type StripeBillingConfig = {
  secretKey: string;
  proPriceId: string;
  proPriceIds: string[];
};

export type StripeWebhookConfig = {
  webhookSecret: string;
};

function parsePriceIds(value: string | undefined): string[] {
  return (value ?? "").split(",").map((id) => id.trim()).filter(Boolean);
}

export function getStripeBillingConfig(env: Env): StripeBillingConfig | null {
  const secretKey = env.STRIPE_SECRET_KEY;
  const proPriceId = env.STRIPE_PRO_PRICE_ID;
  if (!secretKey || !proPriceId) return null;
  const proPriceIds = [...new Set([proPriceId, ...parsePriceIds(env.STRIPE_PRO_LEGACY_PRICE_IDS)])];
  return { secretKey, proPriceId, proPriceIds };
}

export function getStripeWebhookConfig(env: Env): StripeWebhookConfig | null {
  const webhookSecret = env.STRIPE_WEBHOOK_SECRET;
  if (!webhookSecret) return null;
  return { webhookSecret };
}

export function getStripeConfig(env: Env): StripeConfig | null {
  const billing = getStripeBillingConfig(env);
  const webhook = getStripeWebhookConfig(env);
  if (!billing || !webhook) return null;
  return { ...billing, ...webhook };
}

export function assertStripeBillingConfigured(env: Env): StripeBillingConfig {
  const config = getStripeBillingConfig(env);
  if (!config) {
    throw new Error("Stripe billing is not configured. Set STRIPE_SECRET_KEY and STRIPE_PRO_PRICE_ID.");
  }
  return config;
}

export function assertStripeWebhookConfigured(env: Env): StripeWebhookConfig {
  const config = getStripeWebhookConfig(env);
  if (!config) {
    throw new Error("Stripe webhook is not configured. Set STRIPE_WEBHOOK_SECRET.");
  }
  return config;
}

export function assertStripeConfigured(env: Env): StripeConfig {
  const config = getStripeConfig(env);
  if (!config) {
    throw new Error(
      "Stripe is not configured. Set STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET, and STRIPE_PRO_PRICE_ID."
    );
  }
  return config;
}

function encodeForm(body: Record<string, string | number | boolean | undefined | null>): string {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(body)) {
    if (value === undefined || value === null) continue;
    params.set(key, typeof value === "boolean" ? (value ? "true" : "false") : String(value));
  }
  return params.toString();
}

export const stripeObjectSchema = z.object({ id: z.string().min(1) });

export const expandableStripeIdSchema = z
  .union([z.string().min(1), z.object({ id: z.string().min(1) }).passthrough()])
  .transform((value) => (typeof value === "string" ? value : value.id));

const stripeErrorBodySchema = z.object({
  error: z
    .object({
      type: z.string().optional(),
      code: z.string().optional(),
      param: z.string().optional(),
    })
    .passthrough(),
});

function parseStripeErrorBody(text: string): { type?: string | undefined; code?: string | undefined; param?: string | undefined } {
  try {
    const parsed = stripeErrorBodySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.error : {};
  } catch {
    return {};
  }
}

export class StripeApiError extends Error {
  readonly status: number;
  readonly type: string | undefined;
  readonly code: string | undefined;
  readonly param: string | undefined;

  constructor(status: number, body: string) {
    const { type, code, param } = parseStripeErrorBody(body);
    const detail = [type, code].filter(Boolean).join(" ");
    super(`Stripe API error (${status})${detail ? `: ${detail}` : ""}${param ? ` (${param})` : ""}`);
    this.name = "StripeApiError";
    this.status = status;
    this.type = type;
    this.code = code;
    this.param = param;
  }
}

export function isMissingStripeCustomer(error: unknown): error is StripeApiError {
  return error instanceof StripeApiError && error.code === "resource_missing" && error.param === "customer";
}

export function isStripeIdempotencyConflict(error: unknown): error is StripeApiError {
  return error instanceof StripeApiError
    && (error.code === "idempotency_key_in_use" || error.type === "idempotency_error");
}

export async function shortDigest(value: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return Array.from(new Uint8Array(digest).slice(0, 8))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

async function readStripeResponse(resp: Response): Promise<unknown> {
  const text = await resp.text();
  if (!resp.ok) {
    throw new StripeApiError(resp.status, text);
  }
  const body: unknown = JSON.parse(text);
  return body;
}

export async function stripeGet(secretKey: string, path: string): Promise<unknown> {
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  return readStripeResponse(resp);
}

export async function stripePostForm<Reply>(
  secretKey: string,
  path: string,
  body: Record<string, string | number | boolean | undefined | null>,
  reply: z.ZodType<Reply, z.ZodTypeDef, unknown>,
  options?: { idempotencyKey?: string },
): Promise<Reply> {
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: encodeForm(body),
  });

  return reply.parse(await readStripeResponse(resp));
}

function parseStripeSignatureHeader(header: string): { timestamp: number; v1: string[] } | null {
  const parts = header.split(",").map((p) => p.trim());
  let timestamp: number | null = null;
  const v1: string[] = [];

  for (const part of parts) {
    const idx = part.indexOf("=");
    if (idx === -1) continue;
    const key = part.slice(0, idx);
    const value = part.slice(idx + 1);
    if (key === "t") {
      const parsed = Number.parseInt(value, 10);
      if (Number.isFinite(parsed)) timestamp = parsed;
    } else if (key === "v1") {
      v1.push(value);
    }
  }

  if (!timestamp || v1.length === 0) return null;
  return { timestamp, v1 };
}

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(sig))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let result = 0;
  for (let i = 0; i < a.length; i += 1) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return result === 0;
}

export async function verifyStripeWebhookSignature(params: {
  payload: string;
  signatureHeader: string | null;
  webhookSecret: string;
  toleranceSeconds?: number;
}): Promise<{ ok: true; timestamp: number } | { ok: false; error: string }> {
  const toleranceSeconds = params.toleranceSeconds ?? 300;
  if (!params.signatureHeader) return { ok: false, error: "Missing Stripe-Signature header" };

  const parsed = parseStripeSignatureHeader(params.signatureHeader);
  if (!parsed) return { ok: false, error: "Invalid Stripe-Signature header" };

  const nowSeconds = Math.floor(Date.now() / 1000);
  if (Math.abs(nowSeconds - parsed.timestamp) > toleranceSeconds) {
    return { ok: false, error: "Stripe-Signature timestamp outside tolerance" };
  }

  const expected = await hmacSha256Hex(params.webhookSecret, `${parsed.timestamp}.${params.payload}`);
  const matched = parsed.v1.some((sig) => constantTimeEqual(sig, expected));

  if (!matched) return { ok: false, error: "Invalid Stripe-Signature" };
  return { ok: true, timestamp: parsed.timestamp };
}
