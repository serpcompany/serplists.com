import { copyFileSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

import { stringMatching } from "../../support/asymmetricMatchers";
import { CHILD_ENDING_STAND_IN, childrenEndAsEnv } from "../../support/childEndingStandIn";
import { STRIPE_CLI_LISTEN_STAND_IN } from "../../fixtures/stripeCliListenStandIn";
import { processEnvWithout, runScriptProcess } from "../../support/scriptProcess";
import { askForASignal, SIGNAL_WHEN_ASKED, signalWhenAskedEnv } from "../../support/signalWhenAsked";

const SCRIPT = "scripts/stripe/listen-local.ts";
const TEST_KEY = "STRIPE_SECRET_KEY=sk_test_listener\n";
const EVENTS = [
  "checkout.session.completed",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
  "invoice.payment_succeeded",
  "invoice.payment_failed",
].join(",");

const stripeCliBin = mkdtempSync(path.join(tmpdir(), "serplists-stripe-cli-"));
copyFileSync(process.execPath, path.join(stripeCliBin, `stripe${path.extname(process.execPath)}`));

const cliCallSchema = z.object({ args: z.array(z.string()), apiKey: z.string() });

let checkout = "";

beforeEach(() => {
  checkout = mkdtempSync(path.join(tmpdir(), "serplists-stripe-listen-"));
  writeFileSync(path.join(checkout, "listen"), STRIPE_CLI_LISTEN_STAND_IN);
});

afterEach(() => rmSync(checkout, { recursive: true, force: true }));
afterAll(() => rmSync(stripeCliBin, { recursive: true, force: true }));

const inCheckout = (file: string) => path.join(checkout, file);

function stripeCliCalls() {
  const file = inCheckout("stripe-cli-calls.jsonl");
  if (!existsSync(file)) return [];
  return readFileSync(file, "utf8").trim().split("\n").map((line) => cliCallSchema.parse(JSON.parse(line)));
}

function startDevAllOn(port: number) {
  mkdirSync(inCheckout("tmp"), { recursive: true });
  writeFileSync(inCheckout("tmp/dev-session.json"), JSON.stringify({ port, pid: process.pid, startedAt: Date.now() }));
}

function listen({ devVars = TEST_KEY, env = {}, preloads = [] }: { devVars?: string; env?: Record<string, string>; preloads?: string[] } = {}) {
  writeFileSync(inCheckout(".dev.vars"), devVars);
  const inherited = processEnvWithout(["STRIPE_"]);
  const pathName = Object.keys(process.env).find((name) => name.toUpperCase() === "PATH") ?? "PATH";
  return runScriptProcess(SCRIPT, {
    cwd: checkout,
    env: { ...inherited, [pathName]: `${stripeCliBin}${path.delimiter}${process.env[pathName] ?? ""}`, ...env },
    preloads,
  });
}

const FORWARD_TO = "http://localhost:4100/api/stripe/webhook";
const forwardedTo = () => stripeCliCalls().map(({ args }) => args.at(-1));
const restarts = (stdout: string) => stdout.split("\n").filter((line) => line.endsWith("Restarting the listener."));

describe("pnpm run stripe:local:listen (scripts/stripe/listen-local.ts)", () => {
  it("runs stripe listen with the test key, saves the webhook secret to .dev.vars and never prints it", async () => {
    const run = await listen({
      env: { STRIPE_LOCAL_WEBHOOK_URL: "http://localhost:4100/api/stripe/webhook", STRIPE_CLI_STAND_IN_EXIT_CODE: "3" },
    });

    expect(run.status).toBe(3);
    expect(stripeCliCalls()).toEqual([
      {
        args: ["--skip-update", "--events", EVENTS, "--forward-to", "http://localhost:4100/api/stripe/webhook"],
        apiKey: "sk_test_listener",
      },
    ]);
    expect(readFileSync(inCheckout(".dev.vars"), "utf8")).toBe(`${TEST_KEY}STRIPE_WEBHOOK_SECRET=whsec_standin123\n`);
    expect(run.stdout).toContain("Forwarding Stripe events to http://localhost:4100/api/stripe/webhook");
    expect(run.stdout).toContain("Saved the temporary test webhook secret to .dev.vars.");
    expect(run.stdout).toContain("Your webhook signing secret is whsec_[REDACTED]");
    expect(run.stderr).toContain("Signing with whsec_[REDACTED]");
    expect(`${run.stdout}${run.stderr}`).not.toContain("whsec_standin123");
  });

  it("forwards to the port this checkout's dev:all runs on", async () => {
    startDevAllOn(4321);

    const run = await listen();

    expect(run.status).toBe(0);
    expect(stripeCliCalls().map(({ args }) => args.at(-1))).toEqual(["http://localhost:4321/api/stripe/webhook"]);
    expect(run.stdout).not.toContain("dev:all is not running");
  });

  it("forwards to the port dev:all would pick, then restarts on the port dev:all actually starts on", async () => {
    const listening = listen({ env: { STRIPE_CLI_STAND_IN_RUNS_KEPT_ALIVE: "1" } });
    await vi.waitFor(() => expect(stripeCliCalls()).toHaveLength(1), { timeout: 20_000, interval: 50 });
    startDevAllOn(4999);

    const run = await listening;

    expect(run.status).toBe(0);
    const forwardedTo = stripeCliCalls().map(({ args }) => args.at(-1));
    expect(forwardedTo).toEqual([stringMatching(/^http:\/\/localhost:\d+\/api\/stripe\/webhook$/), "http://localhost:4999/api/stripe/webhook"]);
    expect(forwardedTo[0]).not.toBe(forwardedTo[1]);
    expect(run.stdout).toContain("dev:all is not running in this checkout yet.");
    expect(run.stdout).toContain("This checkout's API is at http://localhost:4999/api/stripe/webhook. Restarting the listener.");
  }, 30_000);

  it("keeps forwarding to the URL it is given while dev:all runs on another port, checking each time dev:all could have moved", async () => {
    startDevAllOn(4999);

    const run = await listen({ env: { STRIPE_LOCAL_WEBHOOK_URL: FORWARD_TO, STRIPE_CLI_STAND_IN_RUNS_FOR_MS: "3000" } });

    expect(run.status).toBe(0);
    expect(forwardedTo()).toEqual([FORWARD_TO]);
    expect(restarts(run.stdout)).toEqual([]);
  }, 30_000);

  it("restarts once on dev:all's port when the listener it stops takes longer than a check to stop", async () => {
    const listening = listen({
      env: { STRIPE_CLI_STAND_IN_RUNS_KEPT_ALIVE: "1", STRIPE_CLI_STAND_IN_SLOW_TO_STOP_MS: "2500", ...childrenEndAsEnv({ afterMs: 2500 }) },
      preloads: [CHILD_ENDING_STAND_IN],
    });
    await vi.waitFor(() => expect(stripeCliCalls()).toHaveLength(1), { timeout: 20_000, interval: 50 });
    startDevAllOn(4998);

    const run = await listening;

    expect(run.status).toBe(0);
    expect(forwardedTo()).toEqual([stringMatching(/^http:\/\/localhost:\d+\/api\/stripe\/webhook$/), "http://localhost:4998/api/stripe/webhook"]);
    expect(restarts(run.stdout)).toEqual(["[stripe-listen] This checkout's API is at http://localhost:4998/api/stripe/webhook. Restarting the listener."]);
  }, 30_000);

  it.each(["SIGINT", "SIGTERM"] as const)("stops the listener when it is sent %s, as a terminal's Ctrl+C or a stop does, and ends with status 1", async (signal) => {
    const requestFile = inCheckout("signal-request");
    const listening = listen({
      env: { STRIPE_LOCAL_WEBHOOK_URL: FORWARD_TO, STRIPE_CLI_STAND_IN_RUNS_KEPT_ALIVE: "1", ...signalWhenAskedEnv(requestFile) },
      preloads: [SIGNAL_WHEN_ASKED],
    });
    await vi.waitFor(() => expect(stripeCliCalls()).toHaveLength(1), { timeout: 20_000, interval: 50 });

    askForASignal(requestFile, signal);
    const run = await listening;

    expect(run.status).toBe(1);
    expect(forwardedTo()).toEqual([FORWARD_TO]);
  }, 30_000);

  it("ends with status 0 when stripe listen ends with neither an exit code nor a signal", async () => {
    const run = await listen({
      env: { STRIPE_LOCAL_WEBHOOK_URL: FORWARD_TO, STRIPE_CLI_STAND_IN_EXIT_CODE: "3", ...childrenEndAsEnv({ code: null, signal: null }) },
      preloads: [CHILD_ENDING_STAND_IN],
    });

    expect(run.status).toBe(0);
    expect(forwardedTo()).toEqual([FORWARD_TO]);
  }, 30_000);

  it("needs a test key", async () => {
    const run = await listen({ devVars: "STRIPE_SECRET_KEY=sk_live_in_a_file\n" });

    expect(run.status).toBe(1);
    expect(run.stderr).toContain("Stripe local listener requires a test secret key.");
    expect(stripeCliCalls()).toEqual([]);
  });
});
