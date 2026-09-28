import { parseEnvFile, removeEnvKeys } from "./_env.mjs";

const path = ".dev.vars";
const env = parseEnvFile(path);
const keys = new Set(
  Object.keys(env).filter((key) => key.endsWith("_LIVE")),
);

if (env.STRIPE_SECRET_KEY?.startsWith("sk_live_")) {
  for (const key of [
    "STRIPE_SECRET_KEY",
    "STRIPE_PRO_PRICE_ID",
    "STRIPE_PRO_LEGACY_PRICE_IDS",
    "STRIPE_WEBHOOK_SECRET",
    "STRIPE_PORTAL_CONFIGURATION_ID",
  ]) keys.add(key);
}

for (const key of [
  "STRIPE_ACCOUNT_ID",
  "STRIPE_WEBHOOK_URL",
]) keys.add(key);

removeEnvKeys(path, keys);
console.log(`Removed ${keys.size} production-only Stripe variable name(s) from .dev.vars.`);
