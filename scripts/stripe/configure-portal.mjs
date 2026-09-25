import { loadLocalEnv } from "./_env.mjs";

const env = loadLocalEnv();
const mode = process.argv.includes("--test") ? "test" : "live";
const secretKey = mode === "test"
  ? env.STRIPE_TEST_SECRET_KEY ?? env.STRIPE_SECRET_KEY_TEST
  : env.STRIPE_LIVE_SECRET_KEY ?? env.STRIPE_SECRET_KEY_LIVE ?? env.STRIPE_SECRET_KEY;

if (!secretKey || !secretKey.startsWith(`sk_${mode}_`)) {
  throw new Error(`Missing Stripe ${mode} secret key.`);
}

async function stripeRequest(path, options = {}) {
  const response = await fetch(`https://api.stripe.com${path}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      ...(options.body ? { "Content-Type": "application/x-www-form-urlencoded" } : {}),
    },
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(`Stripe API error (${response.status}): ${data.error?.message ?? "Unknown error"}`);
  }
  return data;
}

const configurations = await stripeRequest("/v1/billing_portal/configurations?active=true&limit=100");
let configuration = configurations.data.find(
  (candidate) =>
    candidate.metadata?.app === "serp-checklists" &&
    candidate.metadata?.purpose === "customer-portal",
);

if (!configuration) {
  const form = new URLSearchParams();
  const values = {
    "business_profile[headline]": "Manage your SERP Lists Pro subscription",
    default_return_url: "https://serplists.com/account",
    "features[customer_update][enabled]": "true",
    "features[invoice_history][enabled]": "true",
    "features[payment_method_update][enabled]": "true",
    "features[subscription_cancel][enabled]": "true",
    "features[subscription_cancel][mode]": "at_period_end",
    "features[subscription_cancel][cancellation_reason][enabled]": "true",
    "features[subscription_update][enabled]": "false",
    "metadata[app]": "serp-checklists",
    "metadata[purpose]": "customer-portal",
  };
  for (const [key, value] of Object.entries(values)) form.set(key, value);
  for (const field of ["name", "email", "address", "tax_id"]) {
    form.append("features[customer_update][allowed_updates][]", field);
  }
  for (const reason of ["too_expensive", "missing_features", "switched_service", "unused", "other"]) {
    form.append("features[subscription_cancel][cancellation_reason][options][]", reason);
  }

  configuration = await stripeRequest("/v1/billing_portal/configurations", {
    method: "POST",
    body: form,
  });
}

console.log(JSON.stringify({
  mode,
  configurationId: configuration.id,
  active: configuration.active,
  isDefault: configuration.is_default,
}, null, 2));
