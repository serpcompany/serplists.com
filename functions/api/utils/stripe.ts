import { z } from "zod";
import type { Env } from "../types";

export type StripeConfig = {
  secretKey: string;
  webhookSecret: string;
  proPriceId: string;
};

export type StripeBillingConfig = {
  secretKey: string;
  /** The price new Checkout sessions use. */
  proPriceId: string;
  /** Every price whose subscription grants Pro: the checkout price, then legacy prices. */
  proPriceIds: string[];
};

export type StripeWebhookConfig = {
  webhookSecret: string;
};

// Stripe prices cannot change amount, so a price change creates a new price while
// existing subscribers stay on the old one. STRIPE_PRO_LEGACY_PRICE_IDS (comma-separated)
// keeps those prices granting Pro after STRIPE_PRO_PRICE_ID moves to the new price.
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

const stripeErrorBodySchema = z.object({
  error: z
    .object({
      type: z.string().optional(),
      code: z.string().optional(),
      param: z.string().optional(),
    })
    .passthrough(),
});

function parseStripeErrorBody(text: string): { type?: string; code?: string; param?: string } {
  try {
    const parsed = stripeErrorBodySchema.safeParse(JSON.parse(text));
    return parsed.success ? parsed.data.error : {};
  } catch {
    return {};
  }
}

/**
 * A non-2xx response from the Stripe API: the HTTP status plus Stripe's error type,
 * code, and param when the body has them. Stripe's message text can echo request data
 * such as an email address, so it stays out of the error message that gets logged.
 */
export class StripeApiError extends Error {
  readonly status: number;
  readonly type?: string;
  readonly code?: string;
  readonly param?: string;

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

/**
 * Stripe has no such customer in this mode: it was deleted, or the stored id belongs
 * to the other mode's keys ("a similar object exists in test mode").
 */
export function isMissingStripeCustomer(error: unknown): error is StripeApiError {
  return error instanceof StripeApiError && error.code === "resource_missing" && error.param === "customer";
}

/**
 * Stripe refused a request because its idempotency key is in use by a request still in
 * flight (409 idempotency_key_in_use), or was first used with other parameters
 * (idempotency_error). Both mean another attempt for the same action is under way.
 */
export function isStripeIdempotencyConflict(error: unknown): error is StripeApiError {
  return error instanceof StripeApiError
    && (error.code === "idempotency_key_in_use" || error.type === "idempotency_error");
}

/**
 * A short SHA-256 hex digest for idempotency keys, so a key changes whenever the
 * request it protects changes (Stripe rejects a reused key with other parameters).
 */
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
  return JSON.parse(text) as unknown;
}

/** GET a Stripe API resource. Callers parse the returned JSON with Zod. */
export async function stripeGet(secretKey: string, path: string): Promise<unknown> {
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method: "GET",
    headers: { Authorization: `Bearer ${secretKey}` },
  });
  return readStripeResponse(resp);
}

export async function stripePostForm<T>(
  secretKey: string,
  path: string,
  body: Record<string, string | number | boolean | undefined | null>,
  options?: { idempotencyKey?: string },
): Promise<T> {
  const resp = await fetch(`https://api.stripe.com${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
      ...(options?.idempotencyKey ? { "Idempotency-Key": options.idempotencyKey } : {}),
    },
    body: encodeForm(body),
  });

  return (await readStripeResponse(resp)) as T;
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
