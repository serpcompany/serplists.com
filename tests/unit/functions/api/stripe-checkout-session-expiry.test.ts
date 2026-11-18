import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { settleOpenCheckoutSessions } from "@functions/api/utils/stripe-checkout-sessions";
import { stripeErrorResponse } from "../../../support/billingCheckout";
import { stripeAnswers } from "../../../support/stripeReplies";

const NOW = 1_900_000_000;
const openSession = (id: string) => ({
  id,
  object: "checkout.session",
  mode: "subscription",
  url: `https://checkout.stripe.com/${id}`,
  expires_at: NOW + 86_400,
  metadata: { userId: "user-1", checkoutParams: "other-params" },
  subscription: null,
});

beforeEach(() => {
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("settleOpenCheckoutSessions", () => {
  it("fails, rather than open a second checkout, when Stripe cannot expire a stale session", async () => {
    stripeAnswers(
      new Response(JSON.stringify({ object: "list", data: [openSession("cs_stale")], has_more: false })),
      stripeErrorResponse(500, { type: "api_error" }),
    );

    await expect(settleOpenCheckoutSessions("sk_test_billing", "cus_1", { userId: "user-1", paramsDigest: "params", nowSeconds: NOW })).rejects.toMatchObject({
      name: "StripeApiError",
      status: 500,
    });
  });
});
