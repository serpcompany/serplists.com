import { z } from "zod";
import { log } from "./logger";
import { StripeApiError, isMissingStripeCustomer, stripeGet, stripePostForm } from "./stripe";

// A buyer needs time to finish paying, so a session closer than this to expiring is
// replaced rather than reused.
const MIN_REUSE_SECONDS = 60 * 60;

const checkoutSessionSchema = z
  .object({
    id: z.string().min(1),
    mode: z.string().min(1),
    url: z.string().nullish(),
    expires_at: z.number(),
    metadata: z.record(z.unknown()).nullish(),
  })
  .passthrough();

const checkoutSessionListSchema = z
  .object({ data: z.array(checkoutSessionSchema), has_more: z.boolean() })
  .passthrough();

type CheckoutSession = z.infer<typeof checkoutSessionSchema>;

/** What makes an open session the same checkout this request would start. */
export type CheckoutSessionMatch = {
  userId: string;
  /** Digest of the price and return URLs, stored on the session as metadata[checkoutParams]. */
  paramsDigest: string;
  nowSeconds: number;
};

export type OpenCheckoutSessions =
  /** One open session matches this checkout; every other one was expired. */
  | { kind: "reuse"; url: string }
  /** No session is open any more: start a new one. */
  | { kind: "none" }
  /** A session left the open state while it was being expired (paid, or expired by a concurrent request). */
  | { kind: "changed" };

function isReusable(session: CheckoutSession, match: CheckoutSessionMatch): boolean {
  return Boolean(session.url)
    && session.metadata?.userId === match.userId
    && session.metadata?.checkoutParams === match.paramsDigest
    && session.expires_at - match.nowSeconds >= MIN_REUSE_SECONDS;
}

/**
 * Leaves the customer at most one open subscription Checkout Session. Each open session
 * stays payable for 24 hours and opens its own subscription, so two left open (a tab
 * left on Checkout, then Upgrade again later) could bill the customer twice. The newest
 * session that matches this checkout is kept for reuse; every other one is expired.
 * Throws when Stripe cannot answer or returns an incomplete or unexpected list.
 */
export async function settleOpenCheckoutSessions(
  secretKey: string,
  stripeCustomerId: string,
  match: CheckoutSessionMatch,
): Promise<OpenCheckoutSessions> {
  let body: unknown;
  try {
    body = await stripeGet(
      secretKey,
      `/v1/checkout/sessions?customer=${encodeURIComponent(stripeCustomerId)}&status=open&limit=100`,
    );
  } catch (error) {
    // A customer Stripe does not have has no sessions; Checkout replaces it.
    if (isMissingStripeCustomer(error)) return { kind: "none" };
    throw error;
  }

  const list = checkoutSessionListSchema.parse(body);
  if (list.has_more) throw new Error("Stripe returned an incomplete Checkout Session list");

  // Stripe lists newest first, so the first match is the newest one.
  const subscriptionSessions = list.data.filter((session) => session.mode === "subscription");
  const reusable = subscriptionSessions.find((session) => isReusable(session, match));

  for (const session of subscriptionSessions) {
    if (session === reusable) continue;
    try {
      await stripePostForm(secretKey, `/v1/checkout/sessions/${encodeURIComponent(session.id)}/expire`, {});
    } catch (error) {
      if (error instanceof StripeApiError && error.status >= 400 && error.status < 500) {
        log("warn", "stripe_checkout_session_changed", { stripeCheckoutSessionId: session.id });
        return { kind: "changed" };
      }
      throw error;
    }
    log("info", "stripe_checkout_session_expired", { stripeCheckoutSessionId: session.id });
  }

  return reusable?.url ? { kind: "reuse", url: reusable.url } : { kind: "none" };
}
