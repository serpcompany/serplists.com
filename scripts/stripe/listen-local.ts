import { type ChildProcess, spawn } from "node:child_process";
import { readDevSession } from "../dev-auto-lib";
import { loadLocalEnv, resolveTestSecretKey, TEST_SECRET_KEY_HINT, updateEnvFile } from "./_env";
import { resolveWebhookForwardTarget, retargetForDevSession } from "./_listen-target";

const SESSION_POLL_MS = 2_000;
const STOP_SIGNALS: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
];

const env = loadLocalEnv();
const testKey = resolveTestSecretKey(env);
if (!testKey) {
  throw new Error(`Stripe local listener requires a test secret key. ${TEST_SECRET_KEY_HINT}`);
}

const target = await resolveWebhookForwardTarget({
  envUrl: env["STRIPE_LOCAL_WEBHOOK_URL"],
  session: readDevSession(),
});
if (target.source === "predicted") {
  console.log(
    "[stripe-listen] dev:all is not running in this checkout yet. Forwarding to the port it would pick now; " +
      "the listener follows it if dev:all starts on another port.",
  );
}

let savedSecret = false;
const forward = (stream: NodeJS.WritableStream, chunk: Buffer) => {
  const text = chunk.toString();
  const match = text.match(/whsec_[A-Za-z0-9]+/);
  if (match && !savedSecret) {
    updateEnvFile(".dev.vars", { STRIPE_WEBHOOK_SECRET: match[0] });
    savedSecret = true;
    console.log("[stripe-listen] Saved the temporary test webhook secret to .dev.vars.");
  }
  stream.write(text.replace(/whsec_[A-Za-z0-9]+/g, "whsec_[REDACTED]"));
};

let child: ChildProcess | null = null;
let restarting = false;
let stopping = false;

function startListener(url: string) {
  console.log(`[stripe-listen] Forwarding Stripe events to ${url}`);
  const listener = spawn("stripe", ["listen", "--skip-update", "--events", EVENTS.join(","), "--forward-to", url], {
    env: { ...process.env, STRIPE_API_KEY: testKey },
    stdio: ["inherit", "pipe", "pipe"],
  });
  listener.stdout.on("data", (chunk: Buffer) => forward(process.stdout, chunk));
  listener.stderr.on("data", (chunk: Buffer) => forward(process.stderr, chunk));
  listener.on("exit", (code, signal) => {
    if (restarting && !stopping) {
      restarting = false;
      startListener(target.url);
      return;
    }
    clearInterval(followDevAllToItsPort);
    process.exitCode = code ?? (signal ? 1 : 0);
  });
  child = listener;
}

const followDevAllToItsPort = setInterval(() => {
  if (stopping || restarting) return;
  const url = retargetForDevSession(target, readDevSession());
  if (!url) return;
  console.log(`[stripe-listen] This checkout's API is at ${url}. Restarting the listener.`);
  target.url = url;
  target.source = "session";
  restarting = true;
  child?.kill();
}, SESSION_POLL_MS);

startListener(target.url);

for (const signal of STOP_SIGNALS) {
  process.on(signal, () => {
    stopping = true;
    clearInterval(followDevAllToItsPort);
    child?.kill(signal);
  });
}
