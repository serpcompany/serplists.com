import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveWebhookForwardTarget,
  retargetForDevSession,
} from "../../../scripts/stripe/_listen-target.mjs";

// Every clone or worktree runs its own dev server on a free port, so the Stripe listener
// must forward to this checkout's API, never to a fixed 3000 that another worktree may own.

const ALIVE = 101;
const DEAD = 202;
const isAlive = (pid: number | null) => pid === ALIVE;

type Session = { port: number; pid: number | null; startedAt: number | null };

const session = (overrides: Partial<Session> = {}): Session => ({
  port: 3001,
  pid: null,
  startedAt: 1_000,
  ...overrides,
});

const allFree = async () => true;
/** Another worktree holds the default port 3000. */
const defaultPortBusy = async (port: number) => port !== 3000;

describe("resolveWebhookForwardTarget", () => {
  it("forwards to the API of this checkout's running dev server", async () => {
    const target = await resolveWebhookForwardTarget({
      session: session({ pid: ALIVE }),
      isAlive,
      portAvailable: defaultPortBusy,
    });

    expect(target).toMatchObject({ url: "http://localhost:3001/api/stripe/webhook", source: "session" });
  });

  it("ignores a stale session and skips a port another worktree holds", async () => {
    const target = await resolveWebhookForwardTarget({
      session: session({ pid: DEAD, port: 3005 }),
      isAlive,
      portAvailable: defaultPortBusy,
    });

    expect(target).toMatchObject({ url: "http://localhost:3001/api/stripe/webhook", source: "predicted" });
  });

  it("predicts the default port only when it is free and nothing runs yet", async () => {
    const target = await resolveWebhookForwardTarget({ session: null, isAlive, portAvailable: allFree });

    expect(target).toMatchObject({ url: "http://localhost:3000/api/stripe/webhook", source: "predicted" });
  });

  it("lets STRIPE_LOCAL_WEBHOOK_URL win over a running session", async () => {
    const target = await resolveWebhookForwardTarget({
      envUrl: " http://localhost:9999/api/stripe/webhook ",
      session: session({ pid: ALIVE }),
      isAlive,
      portAvailable: allFree,
    });

    expect(target).toEqual({ url: "http://localhost:9999/api/stripe/webhook", source: "env" });
  });

  it("rejects a STRIPE_LOCAL_WEBHOOK_URL that is not an http(s) URL", async () => {
    await expect(
      resolveWebhookForwardTarget({ envUrl: "localhost:3001", session: null, isAlive, portAvailable: allFree }),
    ).rejects.toThrow(/STRIPE_LOCAL_WEBHOOK_URL/);
  });
});

describe("retargetForDevSession", () => {
  const predicted = { url: "http://localhost:3000/api/stripe/webhook", source: "predicted" as const };

  it("moves to the port dev:all actually chose", () => {
    expect(retargetForDevSession(predicted, session({ pid: ALIVE }), isAlive)).toBe(
      "http://localhost:3001/api/stripe/webhook",
    );
  });

  it("stays put when the port already matches, the session is stale, or there is none", () => {
    expect(retargetForDevSession(predicted, session({ pid: ALIVE, port: 3000 }), isAlive)).toBeNull();
    expect(retargetForDevSession(predicted, session({ pid: DEAD }), isAlive)).toBeNull();
    expect(retargetForDevSession(predicted, null, isAlive)).toBeNull();
  });

  it("never overrides an explicit STRIPE_LOCAL_WEBHOOK_URL", () => {
    const explicit = { url: "http://localhost:9999/api/stripe/webhook", source: "env" as const };

    expect(retargetForDevSession(explicit, session({ pid: ALIVE }), isAlive)).toBeNull();
  });
});

describe("scripts/stripe/listen-local.mjs", () => {
  const source = readFileSync(new URL("../../../scripts/stripe/listen-local.mjs", import.meta.url), "utf8");

  it("resolves its forward target instead of hardcoding the default port", () => {
    expect(source).not.toMatch(/localhost:\d/);
    expect(source).toMatch(/resolveWebhookForwardTarget/);
  });
});
