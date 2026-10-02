import { afterEach, describe, it, expect, vi } from "vitest";
import { firstOf } from "../../../support/elements";
import {
  getStripeBillingConfig,
  isMissingStripeCustomer,
  isStripeIdempotencyConflict,
  shortDigest,
  StripeApiError,
  stripeGet,
  stripeObjectSchema,
  stripePostForm,
  verifyStripeWebhookSignature,
} from "@functions/api/utils/stripe";
import { apiEnv } from "../../../support/apiEnv";
import { hmacSha256Hex } from "./support/stripe-webhook";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyStripeWebhookSignature", () => {
  it("rejects missing header", async () => {
    const result = await verifyStripeWebhookSignature({
      payload: '{"id":"evt_123"}',
      signatureHeader: null,
      webhookSecret: "whsec_test",
    });
    expect(result.ok).toBe(false);
  });

  it("rejects invalid signature", async () => {
    const payload = '{"id":"evt_123"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const result = await verifyStripeWebhookSignature({
      payload,
      signatureHeader: `t=${timestamp},v1=deadbeef`,
      webhookSecret: "whsec_test",
    });
    expect(result.ok).toBe(false);
  });

  async function signedHeader(payload: string, timestamp: number) {
    return `t=${timestamp},v1=${await hmacSha256Hex("whsec_test", `${timestamp}.${payload}`)}`;
  }

  it("accepts valid signature", async () => {
    const payload = '{"id":"evt_123","type":"customer.subscription.updated"}';

    const result = await verifyStripeWebhookSignature({
      payload,
      signatureHeader: await signedHeader(payload, Math.floor(Date.now() / 1000)),
      webhookSecret: "whsec_test",
    });

    expect(result.ok).toBe(true);
  });

  it("rejects when timestamp outside tolerance", async () => {
    const payload = '{"id":"evt_123"}';

    const result = await verifyStripeWebhookSignature({
      payload,
      signatureHeader: await signedHeader(payload, Math.floor(Date.now() / 1000) - 1000),
      webhookSecret: "whsec_test",
      toleranceSeconds: 10,
    });

    expect(result.ok).toBe(false);
  });
});

describe("stripePostForm", () => {
  it("forwards an idempotency key without putting it in the request body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(
      new Response(JSON.stringify({ id: "cs_test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await stripePostForm("sk_test_example", "/v1/checkout/sessions", { mode: "subscription" }, stripeObjectSchema, {
      idempotencyKey: "checkout-user-1-window",
    });

    const [, options] = firstOf(fetchMock.mock.calls);
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe("checkout-user-1-window");
    expect(options?.body).toBe("mode=subscription");
  });

  it("returns the reply its schema parsed, and refuses a reply the schema does not describe", async () => {
    const replyWith = (body: unknown) => vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 200 }));

    vi.stubGlobal("fetch", replyWith({ id: "cus_1", email: "kept-out@example.com" }));
    await expect(stripePostForm("sk_test_example", "/v1/customers", {}, stripeObjectSchema)).resolves.toEqual({ id: "cus_1" });

    vi.stubGlobal("fetch", replyWith({ object: "customer" }));
    await expect(stripePostForm("sk_test_example", "/v1/customers", {}, stripeObjectSchema)).rejects.toThrow(/id/);
  });
});

describe("stripeGet", () => {
  it("sends an authorized GET and returns the parsed body", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "sub_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(stripeGet("sk_test_example", "/v1/subscriptions/sub_1")).resolves.toEqual({ id: "sub_1" });

    const [url, options] = firstOf(fetchMock.mock.calls);
    expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_1");
    expect(options?.method).toBe("GET");
    expect(new Headers(options?.headers).get("Authorization")).toBe("Bearer sk_test_example");
  });

  it("parses Stripe's error type, code, and param, and keeps its message text out of logs", async () => {
    const body = {
      error: {
        type: "invalid_request_error",
        code: "resource_missing",
        param: "customer",
        message: "No such customer: 'cus_1'; a similar object exists in test mode",
      },
    };
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 })));

    const error = await stripeGet("sk_test_example", "/v1/subscriptions?customer=cus_1").catch((err: unknown) => err);

    expect(error).toMatchObject({ status: 400, type: "invalid_request_error", code: "resource_missing", param: "customer" });
    expect(isMissingStripeCustomer(error)).toBe(true);
    expect((error as Error).message).toBe("Stripe API error (400): invalid_request_error resource_missing (customer)");
  });

  it("throws a StripeApiError with only the status for a body that is not JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", { status: 502 })));

    const error = await stripeGet("sk_test_example", "/v1/subscriptions/sub_1").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(StripeApiError);
    expect(error).toMatchObject({ status: 502, code: undefined, param: undefined });
    expect(isMissingStripeCustomer(error)).toBe(false);
  });

  it("throws a StripeApiError carrying the HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{\"error\":{}}", { status: 404 })));

    const error = await stripeGet("sk_test_example", "/v1/subscriptions/sub_missing").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(StripeApiError);
    expect((error as StripeApiError).status).toBe(404);
  });
});

describe("getStripeBillingConfig", () => {
  const config = (legacy?: string) =>
    getStripeBillingConfig(apiEnv({
      STRIPE_SECRET_KEY: "sk_test_example",
      STRIPE_PRO_PRICE_ID: "price_new",
      ...(legacy === undefined ? {} : { STRIPE_PRO_LEGACY_PRICE_IDS: legacy }),
    }));

  it("grants Pro for the checkout price alone when no legacy prices are set", () => {
    expect(config()?.proPriceIds).toEqual(["price_new"]);
    expect(config("")?.proPriceIds).toEqual(["price_new"]);
  });

  it("adds trimmed, de-duplicated legacy prices and keeps checkout on the current price", () => {
    const parsed = config(" price_old , ,price_older,price_old,price_new ");

    expect(parsed?.proPriceId).toBe("price_new");
    expect(parsed?.proPriceIds).toEqual(["price_new", "price_old", "price_older"]);
  });
});

describe("isStripeIdempotencyConflict", () => {
  const error = (status: number, body: Record<string, string>) => new StripeApiError(status, JSON.stringify({ error: body }));

  it("matches a key still in flight and a key reused with other parameters", () => {
    expect(isStripeIdempotencyConflict(error(409, { type: "invalid_request_error", code: "idempotency_key_in_use" })))
      .toBe(true);
    expect(isStripeIdempotencyConflict(error(400, { type: "idempotency_error" }))).toBe(true);
  });

  it("does not match other Stripe errors", () => {
    expect(isStripeIdempotencyConflict(error(400, { type: "invalid_request_error", code: "resource_missing" })))
      .toBe(false);
    expect(isStripeIdempotencyConflict(new Error("idempotency_error"))).toBe(false);
  });
});

describe("shortDigest", () => {
  it("is stable for the same input and changes with it", async () => {
    const digest = await shortDigest("user@example.test");

    expect(digest).toMatch(/^[0-9a-f]{16}$/);
    expect(await shortDigest("user@example.test")).toBe(digest);
    expect(await shortDigest("other@example.test")).not.toBe(digest);
  });
});
