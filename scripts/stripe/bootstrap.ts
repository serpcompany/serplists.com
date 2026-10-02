import { z } from "zod";
import { loadLocalEnv, resolveLiveSecretKey, resolveTestSecretKey, TEST_SECRET_KEY_HINT } from "./_env";
import { bootstrapUsage, describePrice, dryRunReplySchema, ensurePrice, type StripeRequest } from "./_bootstrap-lib";
import { stripeListOf, stripeProductSchema, type StripeReplySchema } from "./_stripe-objects";

type Mode = "test" | "live" | "both";
type DryRunReply = z.infer<typeof dryRunReplySchema>;
type StripeProduct = z.infer<typeof stripeProductSchema>;
type StripeRequestOptions<Output> = {
  secretKey: string;
  method: "GET" | "POST";
  path: string;
  form?: Record<string, string> | undefined;
  schema: StripeReplySchema<Output>;
  dryRun: boolean;
};

function usage(exitCode: number): never {
  console.log(bootstrapUsage());
  process.exit(exitCode);
}

function parseArgs(argv: readonly string[]): { positionals: string[]; flags: Map<string, string | true> } {
  const positionals: string[] = [];
  const flags = new Map<string, string | true>();
  for (let i = 0; i < argv.length; i += 1) {
    const token = argv[i] ?? "";
    if (!token.startsWith("--")) {
      positionals.push(token);
      continue;
    }
    const key = token.slice(2);
    const next = argv[i + 1];
    if (!next || next.startsWith("--")) {
      flags.set(key, true);
    } else {
      flags.set(key, next);
      i += 1;
    }
  }
  return { positionals, flags };
}

function requireNumber(name: string, value: string | true | undefined): number {
  const n = Number.parseInt(String(value), 10);
  if (!Number.isFinite(n) || n <= 0) {
    throw new Error(`${name} must be a positive integer (cents), got: ${String(value)}`);
  }
  return n;
}

function getKeys(
  env: Readonly<Record<string, string | undefined>>,
  liveEnv: Readonly<Record<string, string | undefined>>,
  mode: Mode,
): { testKey: string | null; liveKey: string | null } {
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

async function stripeRequest<Output>({
  secretKey,
  method,
  path,
  form,
  schema,
  dryRun,
}: StripeRequestOptions<Output>): Promise<Output | DryRunReply> {
  if (dryRun) {
    return { dryRun: true, method, path, form };
  }

  const resp = await fetch(`https://api.stripe.com${path}`, {
    method,
    headers: {
      Authorization: `Bearer ${secretKey}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    ...(form ? { body: new URLSearchParams(form).toString() } : {}),
  });

  const text = await resp.text();
  if (!resp.ok) {
    throw new Error(`Stripe API error (${resp.status}) ${path}: ${text}`);
  }
  return schema.parse(JSON.parse(text));
}

const firstListed = <Item>(reply: { data: Item[] } | DryRunReply): Item | undefined =>
  "dryRun" in reply ? undefined : reply.data[0];

async function searchProProduct({ secretKey, dryRun }: { secretKey: string; dryRun: boolean }): Promise<StripeProduct | null> {
  const query = `metadata['app']:'serp-checklists' AND metadata['tier']:'pro'`;
  try {
    const search = await stripeRequest({
      secretKey,
      method: "GET",
      path: `/v1/products/search?query=${encodeURIComponent(query)}&limit=1`,
      schema: stripeListOf(stripeProductSchema),
      dryRun,
    });
    const existing = firstListed(search);
    return existing?.id ? existing : null;
  } catch {
    return null;
  }
}

async function ensureProProduct({ secretKey, dryRun }: { secretKey: string; dryRun: boolean }): Promise<StripeProduct | DryRunReply> {
  const searched = await searchProProduct({ secretKey, dryRun });
  if (searched) return searched;

  const list = await stripeRequest({
    secretKey,
    method: "GET",
    path: "/v1/products?limit=100&active=true",
    schema: stripeListOf(stripeProductSchema),
    dryRun,
  });

  const existing = "dryRun" in list
    ? undefined
    : list.data.find((p) => p.metadata?.["app"] === "serp-checklists" && p.metadata["tier"] === "pro");
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

async function bootstrapOne({
  secretKey,
  label,
  currency,
  monthly,
  yearly,
  dryRun,
}: {
  secretKey: string;
  label: string;
  currency: string;
  monthly: number;
  yearly: number | null;
  dryRun: boolean;
}) {
  const product = await ensureProProduct({ secretKey, dryRun });
  const productId = "dryRun" in product ? "(dry-run)" : product.id;
  const request: StripeRequest = ({ method, path, form, schema }) => stripeRequest({ secretKey, method, path, form, schema, dryRun });

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
  console.log(`Product: ${productId}`);
  console.log(`Monthly price: ${describePrice(monthlyPrice)}`);
  if (yearly) console.log(`Yearly price: ${describePrice(yearlyPrice)}`);
}

async function main() {
  const env = loadLocalEnv();
  const { flags } = parseArgs(process.argv.slice(2));

  if (flags.get("help")) usage(0);

  const mode = String(flags.get("mode") ?? "both");
  if (mode !== "test" && mode !== "live" && mode !== "both") {
    throw new Error(`--mode must be test|live|both (got: ${mode})`);
  }

  const currency = String(flags.get("currency") ?? "usd").toLowerCase();
  const monthly = requireNumber("--monthly", flags.get("monthly"));
  const yearlyFlag = flags.get("yearly");
  const yearly = yearlyFlag ? requireNumber("--yearly", yearlyFlag) : null;
  const dryRun = Boolean(flags.get("dry-run"));

  const keys = dryRun
    ? {
        testKey: mode === "live" ? null : "sk_test_DRY_RUN",
        liveKey: mode === "test" ? null : "sk_live_DRY_RUN",
      }
    : getKeys(env, process.env, mode);

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

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : String(err));
  process.exit(1);
});
