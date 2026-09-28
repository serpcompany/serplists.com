import { afterEach, describe, it, expect, vi } from "vitest";
import { StripeApiError, stripeGet, stripePostForm, verifyStripeWebhookSignature } from "@functions/api/utils/stripe";

afterEach(() => {
  vi.unstubAllGlobals();
});

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

  it("accepts valid signature", async () => {
    const payload = '{"id":"evt_123","type":"customer.subscription.updated"}';
    const timestamp = Math.floor(Date.now() / 1000);
    const secret = "whsec_test";
    const sig = await hmacSha256Hex(secret, `${timestamp}.${payload}`);

    const result = await verifyStripeWebhookSignature({
      payload,
      signatureHeader: `t=${timestamp},v1=${sig}`,
      webhookSecret: secret,
    });

    expect(result.ok).toBe(true);
  });

  it("rejects when timestamp outside tolerance", async () => {
    const payload = '{"id":"evt_123"}';
    const timestamp = Math.floor(Date.now() / 1000) - 1000;
    const secret = "whsec_test";
    const sig = await hmacSha256Hex(secret, `${timestamp}.${payload}`);

    const result = await verifyStripeWebhookSignature({
      payload,
      signatureHeader: `t=${timestamp},v1=${sig}`,
      webhookSecret: secret,
      toleranceSeconds: 10,
    });

    expect(result.ok).toBe(false);
  });
});

describe("stripePostForm", () => {
  it("forwards an idempotency key without putting it in the request body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ id: "cs_test" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      }),
    );
    vi.stubGlobal("fetch", fetchMock);

    await stripePostForm("sk_test_example", "/v1/checkout/sessions", { mode: "subscription" }, {
      idempotencyKey: "checkout-user-1-window",
    });

    const [, options] = fetchMock.mock.calls[0];
    expect(options.headers["Idempotency-Key"]).toBe("checkout-user-1-window");
    expect(options.body).toBe("mode=subscription");
  });
});

describe("stripeGet", () => {
  it("sends an authorized GET and returns the parsed body", async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response(JSON.stringify({ id: "sub_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    await expect(stripeGet("sk_test_example", "/v1/subscriptions/sub_1")).resolves.toEqual({ id: "sub_1" });

    const [url, options] = fetchMock.mock.calls[0];
    expect(url).toBe("https://api.stripe.com/v1/subscriptions/sub_1");
    expect(options.method).toBe("GET");
    expect(options.headers.Authorization).toBe("Bearer sk_test_example");
  });

  it("throws a StripeApiError carrying the HTTP status", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("{\"error\":{}}", { status: 404 })));

    const error = await stripeGet("sk_test_example", "/v1/subscriptions/sub_missing").catch((err: unknown) => err);

    expect(error).toBeInstanceOf(StripeApiError);
    expect((error as StripeApiError).status).toBe(404);
  });
});
