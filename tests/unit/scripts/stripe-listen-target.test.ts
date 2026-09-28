import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  resolveWebhookForwardTarget,
  retargetForDevSession,
} from "../../../scripts/stripe/_listen-target.mjs";

// Every clone or worktree runs its own dev stack on a free port pair, so the Stripe
// listener must forward to this checkout's API, never to a fixed 8788 that another
// worktree (or the smoke stack) may own.

const ALIVE = 101;
const DEAD = 202;
const isAlive = (pid: number | null) => pid === ALIVE;

type Session = {
  frontendPort: number;
  apiPort: number;
  frontendPid: number | null;
  apiPid: number | null;
  allPid: number | null;
};

const session = (overrides: Partial<Session> = {}): Session => ({
  frontendPort: 8081,
  apiPort: 8789,
  frontendPid: null,
  apiPid: null,
  allPid: null,
  ...overrides,
});

const allFree = async () => true;
/** Another worktree holds the default pair 8080/8788. */
const defaultPairBusy = async (port: number) => port !== 8080 && port !== 8788;

describe("resolveWebhookForwardTarget", () => {
  it("forwards to the API of this checkout's running dev:all stack", async () => {
    const target = await resolveWebhookForwardTarget({
      session: session({ allPid: ALIVE }),
      isAlive,
      portAvailable: defaultPairBusy,
    });

    expect(target).toMatchObject({ url: "http://localhost:8789/api/stripe/webhook", source: "session" });
  });

  it("forwards to a running dev:api stack", async () => {
    const target = await resolveWebhookForwardTarget({
      session: session({ apiPid: ALIVE, apiPort: 8790 }),
      isAlive,
      portAvailable: allFree,
    });

    expect(target.url).toBe("http://localhost:8790/api/stripe/webhook");
  });

  it("ignores a stale session and skips a pair another worktree holds", async () => {
    const target = await resolveWebhookForwardTarget({
      session: session({ allPid: DEAD, apiPid: DEAD, apiPort: 8795 }),
      isAlive,
      portAvailable: defaultPairBusy,
    });

    expect(target).toMatchObject({ url: "http://localhost:8789/api/stripe/webhook", source: "predicted" });
  });

  it("predicts the default port only when it is free and nothing runs yet", async () => {
    const target = await resolveWebhookForwardTarget({ session: null, isAlive, portAvailable: allFree });

    expect(target).toMatchObject({ url: "http://localhost:8788/api/stripe/webhook", source: "predicted" });
  });

  it("lets STRIPE_LOCAL_WEBHOOK_URL win over a running session", async () => {
    const target = await resolveWebhookForwardTarget({
      envUrl: " http://localhost:9999/api/stripe/webhook ",
      session: session({ allPid: ALIVE }),
      isAlive,
      portAvailable: allFree,
    });

    expect(target).toEqual({ url: "http://localhost:9999/api/stripe/webhook", source: "env" });
  });

  it("rejects a STRIPE_LOCAL_WEBHOOK_URL that is not an http(s) URL", async () => {
    await expect(
      resolveWebhookForwardTarget({ envUrl: "localhost:8789", session: null, isAlive, portAvailable: allFree }),
    ).rejects.toThrow(/STRIPE_LOCAL_WEBHOOK_URL/);
  });
});

describe("retargetForDevSession", () => {
  const predicted = { url: "http://localhost:8788/api/stripe/webhook", source: "predicted" as const };

  it("moves to the port dev:all actually chose", () => {
    expect(retargetForDevSession(predicted, session({ allPid: ALIVE }), isAlive)).toBe(
      "http://localhost:8789/api/stripe/webhook",
    );
  });

  it("stays put when the port already matches, the session is stale, or there is none", () => {
    expect(retargetForDevSession(predicted, session({ allPid: ALIVE, apiPort: 8788 }), isAlive)).toBeNull();
    expect(retargetForDevSession(predicted, session({ allPid: DEAD }), isAlive)).toBeNull();
    expect(retargetForDevSession(predicted, null, isAlive)).toBeNull();
  });

  it("never overrides an explicit STRIPE_LOCAL_WEBHOOK_URL", () => {
    const explicit = { url: "http://localhost:9999/api/stripe/webhook", source: "env" as const };

    expect(retargetForDevSession(explicit, session({ allPid: ALIVE }), isAlive)).toBeNull();
  });
});

describe("scripts/stripe/listen-local.mjs", () => {
  const source = readFileSync(new URL("../../../scripts/stripe/listen-local.mjs", import.meta.url), "utf8");

  it("resolves its forward target instead of hardcoding the default API port", () => {
    expect(source).not.toMatch(/8788/);
    expect(source).toMatch(/resolveWebhookForwardTarget/);
  });
});
