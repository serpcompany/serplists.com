import { createHmac } from "node:crypto";

export function hmacSha256Hex(secret: string, message: string): string {
  return createHmac("sha256", secret).update(message).digest("hex");
}

export async function signedWebhookRequest(event: Record<string, unknown>, webhookSecret: string): Promise<Request> {
  const payload = JSON.stringify(event);
  const timestamp = Math.floor(Date.now() / 1000);
  const signature = hmacSha256Hex(webhookSecret, `${timestamp}.${payload}`);
  return new Request("http://localhost/api/stripe/webhook", {
    method: "POST",
    headers: { "Stripe-Signature": `t=${timestamp},v1=${signature}` },
    body: payload,
  });
}
