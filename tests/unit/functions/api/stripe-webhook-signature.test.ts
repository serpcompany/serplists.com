import { afterEach, describe, expect, it, vi } from "vitest";
import { firstOf } from "../../../support/elements";
import {
  assertStripeWebhookConfigured,
  expandableStripeIdSchema,
  getStripeBillingConfig,
  stripeObjectSchema,
  stripePostForm,
  verifyStripeWebhookSignature,
} from "@functions/api/utils/stripe";
import { apiEnv } from "../../../support/apiEnv";
import { hmacSha256Hex } from "./support/stripe-webhook";

const SECRET = "whsec_test";
const PAYLOAD = '{"id":"evt_123"}';
const now = () => Math.floor(Date.now() / 1000);
const signatureOf = (timestamp: number, secret = SECRET) => hmacSha256Hex(secret, `${timestamp}.${PAYLOAD}`);
const verify = (signatureHeader: string) => verifyStripeWebhookSignature({ payload: PAYLOAD, signatureHeader, webhookSecret: SECRET });

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("verifyStripeWebhookSignature with the headers Stripe sends", () => {
  it("accepts a header that also carries a signature from a rolled secret and a v0 scheme", async () => {
    const timestamp = now();

    await expect(verify(`t=${timestamp},v1=${signatureOf(timestamp, "whsec_old")},v0=abc,v1=${signatureOf(timestamp)}`)).resolves.toEqual({
      ok: true,
      timestamp,
    });
  });

  it.each([
    ["no timestamp", () => `v1=${signatureOf(now())}`],
    ["a timestamp that is not a number", () => `t=soon,v1=${signatureOf(now())}`],
    ["no v1 signature", () => `t=${now()},v0=abc`],
    ["parts with no value", () => "t,v1"],
  ])("refuses a header with %s as malformed", async (_label, header) => {
    await expect(verify(header())).resolves.toEqual({ ok: false, error: "Invalid Stripe-Signature header" });
  });

  it("refuses a signature of another length without comparing it", async () => {
    await expect(verify(`t=${now()},v1=${signatureOf(now()).slice(1)}`)).resolves.toEqual({ ok: false, error: "Invalid Stripe-Signature" });
  });
});

describe("assertStripeWebhookConfigured", () => {
  it("hands back the webhook secret", () => {
    expect(assertStripeWebhookConfigured(apiEnv({ STRIPE_WEBHOOK_SECRET: SECRET }))).toEqual({ webhookSecret: SECRET });
  });

  it("fails naming the variable to set when the secret is missing", () => {
    expect(() => assertStripeWebhookConfigured(apiEnv())).toThrow("Set STRIPE_WEBHOOK_SECRET.");
  });
});

describe("getStripeBillingConfig without both settings", () => {
  it.each([
    ["no secret key", { STRIPE_PRO_PRICE_ID: "price_new" }],
    ["no Pro price", { STRIPE_SECRET_KEY: "sk_test_example" }],
  ])("turns billing off with %s", (_label, vars) => {
    expect(getStripeBillingConfig(apiEnv(vars))).toBeNull();
  });
});

describe("expandableStripeIdSchema", () => {
  it("reads the id of an expanded object as well as a bare id", () => {
    expect(expandableStripeIdSchema.parse("cus_1")).toBe("cus_1");
    expect(expandableStripeIdSchema.parse({ id: "cus_2", object: "customer" })).toBe("cus_2");
  });
});

describe("stripePostForm form encoding", () => {
  it("sends numbers and booleans as Stripe reads them and leaves unset fields out", async () => {
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "cs_test" })));
    vi.stubGlobal("fetch", fetchMock);

    await stripePostForm(
      "sk_test_example",
      "/v1/checkout/sessions",
      { "line_items[0][quantity]": 1, allow_promotion_codes: true, configuration: undefined },
      stripeObjectSchema,
    );

    const [, options] = firstOf(fetchMock.mock.calls);
    expect(options?.body).toBe("line_items%5B0%5D%5Bquantity%5D=1&allow_promotion_codes=true");
  });
});
