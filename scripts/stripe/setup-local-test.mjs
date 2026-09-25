import { loadLocalEnv, parseEnvFile, updateEnvFile } from "./_env.mjs";

const localEnv = parseEnvFile(".dev.vars");
const env = loadLocalEnv();
const forbiddenLocalKeys = Object.keys(localEnv).filter((key) => key.endsWith("_LIVE"));
const containsLiveStripeKey = Object.values(localEnv).some(
  (value) => typeof value === "string" && value.startsWith("sk_live_"),
);
if (forbiddenLocalKeys.length > 0 || containsLiveStripeKey) {
  throw new Error(
    ".dev.vars must contain local/test values only. Run pnpm run stripe:local:scrub-live first.",
  );
}

const testKey = env.STRIPE_TEST_SECRET_KEY ?? env.STRIPE_SECRET_KEY_TEST;
if (!testKey?.startsWith("sk_test_")) {
  throw new Error("Missing STRIPE_TEST_SECRET_KEY or STRIPE_SECRET_KEY_TEST in .dev.vars.");
}

async function stripeGet(path) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${testKey}` },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe API error (${response.status}): ${data.error?.message ?? "Unknown error"}`);
  }
  return data;
}

const prices = await stripeGet("/v1/prices?lookup_keys[]=serp-checklists_pro_monthly&active=true&limit=1");
const price = prices.data[0];
if (!price?.id || price.unit_amount !== 900 || price.currency !== "usd" || price.recurring?.interval !== "month") {
  throw new Error("Expected an active $9 USD monthly test price. Run the Stripe bootstrap first.");
}

const configurations = await stripeGet("/v1/billing_portal/configurations?active=true&limit=100");
const portal = configurations.data.find(
  (candidate) =>
    candidate.metadata?.app === "serp-checklists" &&
    candidate.metadata?.purpose === "customer-portal",
);
if (!portal?.id) {
  throw new Error("Expected a test Customer Portal configuration. Run the portal bootstrap first.");
}

const updates = {
  STRIPE_SECRET_KEY: testKey,
  STRIPE_PRO_PRICE_ID: price.id,
  STRIPE_PORTAL_CONFIGURATION_ID: portal.id,
};

updateEnvFile(".dev.vars", updates);
console.log("Local Stripe runtime is configured for the $9/month test plan.");
