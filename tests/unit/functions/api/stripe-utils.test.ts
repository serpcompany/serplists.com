import { describe, it, expect } from "vitest";
import { verifyStripeWebhookSignature } from "@functions/api/utils/stripe";

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

