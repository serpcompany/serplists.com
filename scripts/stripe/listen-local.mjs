import { spawn } from "node:child_process";
import { loadLocalEnv, updateEnvFile } from "./_env.mjs";

const env = loadLocalEnv();
const testKey = env.STRIPE_TEST_SECRET_KEY ?? env.STRIPE_SECRET_KEY_TEST ?? env.STRIPE_SECRET_KEY;
if (!testKey?.startsWith("sk_test_")) {
  throw new Error("Stripe local listener requires a test secret key.");
}

const webhookUrl = process.env.STRIPE_LOCAL_WEBHOOK_URL ?? "http://localhost:8788/api/stripe/webhook";
const child = spawn("stripe", [
  "listen",
  "--skip-update",
  "--events",
  [
    "checkout.session.completed",
    "customer.subscription.created",
    "customer.subscription.updated",
    "customer.subscription.deleted",
    "invoice.payment_succeeded",
    "invoice.payment_failed",
  ].join(","),
  "--forward-to",
  webhookUrl,
], {
  env: { ...process.env, STRIPE_API_KEY: testKey },
  stdio: ["inherit", "pipe", "pipe"],
});

let savedSecret = false;
const forward = (stream, chunk) => {
  const text = chunk.toString();
  const match = text.match(/whsec_[A-Za-z0-9]+/);
  if (match && !savedSecret) {
    updateEnvFile(".dev.vars", { STRIPE_WEBHOOK_SECRET: match[0] });
    savedSecret = true;
    console.log("[stripe-listen] Saved the temporary test webhook secret to .dev.vars.");
  }
  stream.write(text.replace(/whsec_[A-Za-z0-9]+/g, "whsec_[REDACTED]"));
};

child.stdout.on("data", (chunk) => forward(process.stdout, chunk));
child.stderr.on("data", (chunk) => forward(process.stderr, chunk));
child.on("exit", (code, signal) => process.exitCode = code ?? (signal ? 1 : 0));

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => child.kill(signal));
}
