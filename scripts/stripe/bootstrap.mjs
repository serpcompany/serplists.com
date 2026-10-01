import { loadLocalEnv, resolveLiveSecretKey, resolveTestSecretKey, TEST_SECRET_KEY_HINT } from "./_env.mjs";
import { bootstrapUsage, describePrice, ensurePrice } from "./_bootstrap-lib.mjs";
import { stripeListOf, stripeProductSchema } from "./_stripe-objects.mjs";

function usage(exitCode) {
  console.log(bootstrapUsage());
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

function getKeys(env, liveEnv, mode) {
  const testKey = resolveTestSecretKey(env);
  const injectedLiveKey = resolveLiveSecretKey(liveEnv);

  if (mode === "test") {
    if (!testKey) throw new Error(`Missing Stripe test secret key. ${TEST_SECRET_KEY_HINT}`);
    return { testKey, liveKey: null };
  }
  if (mode === "live") {
    if (!injectedLiveKey) {
      throw new Error("Live mode requires STRIPE_LIVE_SECRET_KEY injected through the process environment.");
    }
    return { testKey: null, liveKey: injectedLiveKey };
  }
  if (!testKey || !injectedLiveKey) {
    throw new Error(
      "For --mode both, set a local test key and inject STRIPE_LIVE_SECRET_KEY through the process environment.",
    );
  }
  return { testKey, liveKey: injectedLiveKey };
}

async function stripeRequest({ secretKey, method, path, form, schema, dryRun }) {
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
  return schema.parse(JSON.parse(text));
}

async function searchProProduct({ secretKey, dryRun }) {
  const query = `metadata['app']:'serp-checklists' AND metadata['tier']:'pro'`;
  try {
    const search = await stripeRequest({
      secretKey,
      method: "GET",
      path: `/v1/products/search?query=${encodeURIComponent(query)}&limit=1`,
      schema: stripeListOf(stripeProductSchema),
      dryRun,
    });
    const existing = search?.data?.[0];
    return existing?.id ? existing : null;
  } catch {
    return null;
  }
}

async function ensureProProduct({ secretKey, dryRun }) {
  const searched = await searchProProduct({ secretKey, dryRun });
  if (searched) return searched;

  const list = await stripeRequest({
    secretKey,
    method: "GET",
    path: "/v1/products?limit=100&active=true",
    schema: stripeListOf(stripeProductSchema),
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
    schema: stripeProductSchema,
    dryRun,
  });
}

async function bootstrapOne({ secretKey, label, currency, monthly, yearly, dryRun }) {
  const product = await ensureProProduct({ secretKey, dryRun });
  const productId = product?.id ?? "(dry-run)";
  const request = ({ method, path, form, schema }) => stripeRequest({ secretKey, method, path, form, schema, dryRun });

  const monthlyPrice = await ensurePrice({
    request,
    productId,
    lookupKey: "serp-checklists_pro_monthly",
    currency,
    unitAmount: monthly,
    interval: "month",
  });

  const yearlyPrice = yearly
    ? await ensurePrice({
        request,
        productId,
        lookupKey: "serp-checklists_pro_yearly",
        currency,
        unitAmount: yearly,
        interval: "year",
      })
    : null;

  console.log(`\n[${label}]`);
  console.log(`Product: ${product?.id ?? "(dry-run)"}`);
  console.log(`Monthly price: ${describePrice(monthlyPrice)}`);
  if (yearly) console.log(`Yearly price: ${describePrice(yearlyPrice)}`);
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
      return {
        testKey: mode === "live" ? null : "sk_test_DRY_RUN",
        liveKey: mode === "test" ? null : "sk_live_DRY_RUN",
      };
    }
    return getKeys(env, process.env, mode);
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
