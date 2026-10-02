import { z } from "zod";
import { log } from "./logger";
import {
  StripeApiError,
  expandableStripeIdSchema,
  isMissingStripeCustomer,
  stripeGet,
  stripeObjectSchema,
  stripePostForm,
} from "./stripe";

const MIN_SECONDS_LEFT_TO_REUSE_SESSION = 60 * 60;

const checkoutSessionSchema = z
  .object({
    id: z.string().min(1),
    mode: z.string().min(1),
    url: z.string().nullish(),
    expires_at: z.number(),
    metadata: z.object({ userId: z.unknown(), checkoutParams: z.unknown() }).passthrough().nullish(),
    subscription: expandableStripeIdSchema.nullish().transform((subscriptionId) => subscriptionId ?? null),
  })
  .passthrough();

const checkoutSessionListSchema = z
  .object({ data: z.array(checkoutSessionSchema), has_more: z.boolean() })
  .passthrough();

type CheckoutSession = z.infer<typeof checkoutSessionSchema>;

export type CheckoutSessionMatch = {
  userId: string;
  paramsDigest: string;
  nowSeconds: number;
};

export type OpenCheckoutSessions =
  | { kind: "reuse"; url: string; subscriptionId: string | null }
  | { kind: "none" }
  | { kind: "changed" };

function isReusable(session: CheckoutSession, match: CheckoutSessionMatch): boolean {
  return Boolean(session.url)
    && session.metadata?.userId === match.userId
    && session.metadata?.checkoutParams === match.paramsDigest
    && session.expires_at - match.nowSeconds >= MIN_SECONDS_LEFT_TO_REUSE_SESSION;
}

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
    if (isMissingStripeCustomer(error)) return { kind: "none" };
    throw error;
  }

  const list = checkoutSessionListSchema.parse(body);
  if (list.has_more) throw new Error("Stripe returned an incomplete Checkout Session list");

  const subscriptionSessionsNewestFirst = list.data.filter((session) => session.mode === "subscription");
  const newestReusable = subscriptionSessionsNewestFirst.find((session) => isReusable(session, match));

  for (const session of subscriptionSessionsNewestFirst) {
    if (session === newestReusable) continue;
    try {
      await stripePostForm(
        secretKey,
        `/v1/checkout/sessions/${encodeURIComponent(session.id)}/expire`,
        {},
        stripeObjectSchema,
      );
    } catch (error) {
      if (error instanceof StripeApiError && error.status >= 400 && error.status < 500) {
        log("warn", "stripe_checkout_session_changed", { stripeCheckoutSessionId: session.id });
        return { kind: "changed" };
      }
      throw error;
    }
    log("info", "stripe_checkout_session_expired", { stripeCheckoutSessionId: session.id });
  }

  return newestReusable?.url
    ? { kind: "reuse", url: newestReusable.url, subscriptionId: newestReusable.subscription }
    : { kind: "none" };
}
