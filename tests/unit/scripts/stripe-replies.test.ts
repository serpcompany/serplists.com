import { describe, expect, it } from "vitest";

import { readStripeReply, stripeProductSchema } from "../../../scripts/stripe/_stripe-objects";

const reply = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

describe("readStripeReply", () => {
  it("returns a successful reply parsed by its schema", async () => {
    await expect(
      readStripeReply(reply(200, { id: "prod_1", metadata: { app: "serp-checklists" }, extra: true }), stripeProductSchema),
    ).resolves.toEqual({ id: "prod_1", metadata: { app: "serp-checklists" } });
  });

  it("refuses a successful reply that is not the object the schema describes", async () => {
    await expect(readStripeReply(reply(200, { id: "" }), stripeProductSchema)).rejects.toThrow();
  });

  it("throws with Stripe's own message when Stripe refuses the request", async () => {
    await expect(
      readStripeReply(reply(401, { error: { message: "Invalid API Key provided: sk_test_***" } }), stripeProductSchema),
    ).rejects.toThrow("Stripe API error (401): Invalid API Key provided: sk_test_***");
  });

  it("still names the status when an error reply carries no message", async () => {
    await expect(readStripeReply(reply(502, { unexpected: true }), stripeProductSchema)).rejects.toThrow(
      "Stripe API error (502): Unknown error",
    );
  });
});
