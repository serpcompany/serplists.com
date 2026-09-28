// Builds Stripe webhook requests with a valid Stripe-Signature header, so tests run the
// real signature check instead of mocking it.

async function hmacSha256Hex(secret: string, message: string): Promise<string> {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(secret),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(message));
  return Array.from(new Uint8Array(signature))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

export async function signedWebhookRequest(event: Record<string, unknown>, webhookSecret: string): Promise<Request> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = await hmacSha256Hex(webhookSecret, `${timestamp}.${payload}`);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}
