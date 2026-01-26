import { loadLocalEnv } from "./_env.mjs";

function usage(exitCode) {
  console.log(`Usage:
  node scripts/stripe/bootstrap.mjs --mode both --currency usd --monthly 1900 [--yearly 19000] [--dry-run]

Reads keys from .env / .env.local / .dev.vars:
  STRIPE_TEST_SECRET_KEY=sk_test_...
  STRIPE_LIVE_SECRET_KEY=sk_live_...

Or a single STRIPE_SECRET_KEY (sk_test_... or sk_live_...) for single-mode runs.
`);
  process.exit(exitCode);
}

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i];
    if (!token.startsWith("--")) {
      args._.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      args[key] = true;
    } else {
      args[key] = next;
      i += 1;
    }
  }
  return args;
}

function requireNumber(name, value) {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer (cents), got: ${value}`);
  }
  return n;
}

function getKeys(env, mode) {
  const fromSingle = env.STRIPE_SECRET_KEY;
  const testKey =
    env.STRIPE_TEST_SECRET_KEY ??
    env.STRIPE_SECRET_KEY_TEST ??
    (fromSingle?.startsWith("sk_test_") ? fromSingle : undefined);
  const liveKey =
    env.STRIPE_LIVE_SECRET_KEY ??
    env.STRIPE_SECRET_KEY_LIVE ??
    (fromSingle?.startsWith("sk_live_") ? fromSingle : undefined);

  if (mode === "test") {
    if (!testKey) throw new Error("Missing STRIPE_TEST_SECRET_KEY (or STRIPE_SECRET_KEY starting with sk_test_)");
    return { testKey, liveKey: null };
  }
  if (mode === "live") {
    if (!liveKey) throw new Error("Missing STRIPE_LIVE_SECRET_KEY (or STRIPE_SECRET_KEY starting with sk_live_)");
    return { testKey: null, liveKey };
  }
  // both
  if (!testKey || !liveKey) {
    throw new Error("For --mode both, set both STRIPE_TEST_SECRET_KEY and STRIPE_LIVE_SECRET_KEY");
  }
  return { testKey, liveKey };
}

async function stripeRequest({ secretKey, method, path, form, dryRun }) {
  if (dryRun) {
    return { dryRun: true, method, path, form };
  }

  const resp = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: form ? new URLSearchParams(form).toString() : undefined,
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Stripe API error (${resp.status}) ${path}: ${text}`);
  }
  return JSON.parse(text);
}

async function ensureProProduct({ secretKey, dryRun }) {
  // Prefer Search API (fast). Fallback to listing.
  const query = `metadata['app']:'serp-checklists' AND metadata['tier']:'pro'`;
  try {
    const search = await stripeRequest({
      secretKey,
      method: "GET",
      path: `/v1/products/search?query=${encodeURIComponent(query)}&limit=1`,
      dryRun,
    });
    const existing = search?.data?.[0];
    if (existing?.id) return existing;
  } catch {
    // ignore and fallback
  }

  const list = await stripeRequest({
    secretKey,
    method: "GET",
    path: "/v1/products?limit=100&active=true",
    dryRun,
  });

  const existing = list?.data?.find((p) => p?.metadata?.app === "serp-checklists" && p?.metadata?.tier === "pro");
  if (existing?.id) return existing;

  return stripeRequest({
    secretKey,
    method: "POST",
    path: "/v1/products",
    form: {
      name: "SERP Lists Pro",
      description: "Pro subscription for SERP Lists",
      "metadata[app]": "serp-checklists",
      "metadata[tier]": "pro",
    },
    dryRun,
  });
}

async function ensurePrice({ secretKey, productId, lookupKey, currency, unitAmount, interval, dryRun }) {
  const lookupResp = await stripeRequest({
    secretKey,
    method: "GET",
    path: `/v1/prices?lookup_keys[]=${encodeURIComponent(lookupKey)}&limit=1`,
    dryRun,
  });

  const existing = lookupResp?.data?.[0];
  if (existing?.id) return existing;

  return stripeRequest({
    secretKey,
    method: "POST",
    path: "/v1/prices",
    form: {
      product: productId,
      currency,
      unit_amount: String(unitAmount),
      "recurring[interval]": interval,
      lookup_key: lookupKey,
      "metadata[app]": "serp-checklists",
      "metadata[tier]": "pro",
    },
    dryRun,
  });
}

async function bootstrapOne({ secretKey, label, currency, monthly, yearly, dryRun }) {
  const product = await ensureProProduct({ secretKey, dryRun });
  const productId = product?.id ?? "(dry-run)";

  const monthlyPrice = await ensurePrice({
    secretKey,
    productId,
    lookupKey: "serp-checklists_pro_monthly",
    currency,
    unitAmount: monthly,
    interval: "month",
    dryRun,
  });

  const yearlyPrice = yearly
    ? await ensurePrice({
        secretKey,
        productId,
        lookupKey: "serp-checklists_pro_yearly",
        currency,
        unitAmount: yearly,
        interval: "year",
        dryRun,
      })
    : null;

  console.log(`\n[${label}]`);
  console.log(`Product: ${product?.id ?? "(dry-run)"}`);
  console.log(`Monthly price: ${monthlyPrice?.id ?? "(dry-run)"}`);
  if (yearly) console.log(`Yearly price: ${yearlyPrice?.id ?? "(dry-run)"}`);
}

async function main() {
  const env = loadLocalEnv();
  const args = parseArgs(process.argv.slice(2));

  if (args.help) usage(0);

  const mode = (args.mode ?? "both").toString();
  if (mode !== "test" && mode !== "live" && mode !== "both") {
    throw new Error(`--mode must be test|live|both (got: ${mode})`);
  }

  const currency = (args.currency ?? "usd").toString().toLowerCase();
  const monthly = requireNumber("--monthly", args.monthly);
  const yearly = args.yearly ? requireNumber("--yearly", args.yearly) : null;
  const dryRun = Boolean(args["dry-run"]);

  const keys = (() => {
    if (dryRun) {
      // Allow dry-run without real keys.
      const guessed = getKeys(env, mode);
      return {
        testKey: guessed.testKey ?? "sk_test_DRY_RUN",
        liveKey: guessed.liveKey ?? "sk_live_DRY_RUN",
      };
    }
    return getKeys(env, mode);
  })();

  if (keys.testKey && mode !== "live") {
    await bootstrapOne({ secretKey: keys.testKey, label: "test", currency, monthly, yearly, dryRun });
  }
  if (keys.liveKey && mode !== "test") {
    await bootstrapOne({ secretKey: keys.liveKey, label: "live", currency, monthly, yearly, dryRun });
  }

  console.log("\nNext:");
  console.log("- Copy the LIVE monthly price id into Cloudflare Pages env var STRIPE_PRO_PRICE_ID");
  console.log("- Set STRIPE_WEBHOOK_SECRET from the Stripe webhook you created");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
