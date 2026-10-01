import { parseEnvFile } from "../lib/env-file.mjs";
import { loadLocalEnv, resolveTestSecretKey, TEST_SECRET_KEY_HINT, updateEnvFile } from "./_env.mjs";
import { describePriceMismatch, PRO_CURRENCY, PRO_MONTHLY_CENTS } from "./_price.mjs";
import { readStripeReply, stripeListOf, stripePortalConfigurationSchema, stripePriceSchema } from "./_stripe-objects.mjs";

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

const testKey = resolveTestSecretKey(env);
if (!testKey) {
  throw new Error(`Missing Stripe test secret key. ${TEST_SECRET_KEY_HINT}`);
}

async function stripeGet(path, schema) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    headers: { Authorization: `Bearer ${testKey}` },
  });
  return readStripeReply(response, schema);
}

const prices = await stripeGet(
  "/v1/prices?lookup_keys[]=serp-checklists_pro_monthly&active=true&limit=1",
  stripeListOf(stripePriceSchema),
);
const price = prices.data[0];
if (!price?.id) {
  throw new Error("Expected an active $9 USD monthly test price. Run the Stripe bootstrap first.");
}
const priceMismatch = describePriceMismatch(price, {
  unitAmount: PRO_MONTHLY_CENTS,
  currency: PRO_CURRENCY,
  interval: "month",
});
if (priceMismatch) {
  throw new Error(
    `Test price ${price.id} has ${priceMismatch}. Stripe prices cannot change, so a bootstrap rerun ` +
      "will not fix it: archive the price or move its lookup key in the Stripe Dashboard first.",
  );
}

const configurations = await stripeGet(
  "/v1/billing_portal/configurations?active=true&limit=100",
  stripeListOf(stripePortalConfigurationSchema),
);
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
