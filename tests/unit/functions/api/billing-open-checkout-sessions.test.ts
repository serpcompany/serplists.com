import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { capturedGroup, firstOf } from "../../../support/elements";
import { sessionMocks } from "../../../support/mockedSession";
import "../../../support/checkoutWithoutARateLimit";
import {
  billingSchemaSql,
  postToBilling,
  seedBillingUser,
  storeSubscriptionRow,
  stripeBillingEnv,
  stripeSubscription,
} from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";

const USER_ID = "user-1";
const CUSTOMER_ID = "cus_1";
const DAY_SECONDS = 24 * 60 * 60;

type StripeSession = {
  id: string;
  object: "checkout.session";
  customer: string;
  mode: string;
  status: "open" | "complete" | "expired";
  url: string | null;
  created: number;
  expires_at: number;
  metadata: Record<string, string>;
  subscription: string | null;
};

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;
let sessions: StripeSession[];
let idempotentResponses: Map<string, string>;
let nextSessionId: number;
let subscriptionsStripeLists: unknown[];
let sessionListOverride: (() => Response) | null;
let whileStripeExpiresTheSession: ((session: StripeSession) => void) | null;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function metadataFrom(form: URLSearchParams): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of form) {
    const match = /^metadata\[(.+)\]$/.exec(key);
    if (match) metadata[capturedGroup(match, 1)] = value;
  }
  return metadata;
}

function addSession(overrides: Partial<StripeSession> = {}): StripeSession {
  const id = `cs_${++nextSessionId}`;
  const session: StripeSession = {
    id,
    object: "checkout.session",
    customer: CUSTOMER_ID,
    mode: "subscription",
    status: "open",
    url: `https://checkout.stripe.test/${id}`,
    created: nowSeconds(),
    expires_at: nowSeconds() + DAY_SECONDS,
    metadata: { userId: USER_ID },
    subscription: null,
    ...overrides,
  };
  sessions.push(session);
  return session;
}

function cancelTheIncompleteSubscriptionItOpened(session: StripeSession) {
  subscriptionsStripeLists = subscriptionsStripeLists.filter(
    (subscription) => (subscription as { id: string }).id !== session.subscription,
  );
}

function stripeMock(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const form = new URLSearchParams(String(init?.body ?? ""));
  const idempotencyKey = (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"];

  if (method === "GET" && url.pathname === "/v1/subscriptions") {
    return jsonResponse({ object: "list", data: subscriptionsStripeLists, has_more: false });
  }
  if (method === "GET" && url.pathname === "/v1/checkout/sessions") {
    if (sessionListOverride) return sessionListOverride();
    const customer = url.searchParams.get("customer");
    const status = url.searchParams.get("status");
    const data = sessions
      .filter((session) => session.customer === customer && (!status || session.status === status))
      .reverse();
    return jsonResponse({ object: "list", data, has_more: false });
  }
  const expire = /^\/v1\/checkout\/sessions\/([^/]+)\/expire$/.exec(url.pathname);
  if (method === "POST" && expire) {
    const session = sessions.find((candidate) => candidate.id === expire[1]);
    if (session) whileStripeExpiresTheSession?.(session);
    if (!session || session.status !== "open") {
      return jsonResponse({ error: { type: "invalid_request_error", message: "Session is not open." } }, 400);
    }
    session.status = "expired";
    session.url = null;
    cancelTheIncompleteSubscriptionItOpened(session);
    return jsonResponse(session);
  }
  if (method === "POST" && url.pathname === "/v1/checkout/sessions") {
    const replay = idempotencyKey ? idempotentResponses.get(idempotencyKey) : undefined;
    if (replay) return new Response(replay);
    const session = addSession({ customer: form.get("customer") ?? "", metadata: metadataFrom(form) });
    const body = JSON.stringify(session);
    if (idempotencyKey) idempotentResponses.set(idempotencyKey, body);
    return new Response(body);
  }
  throw new Error(`Unexpected Stripe call: ${method} ${url}`);
}

const checkout = () => postToBilling(stripeBillingEnv(d1), "checkout");

function stripeCalls(): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(String(input));
    return `${(init as RequestInit | undefined)?.method ?? "GET"} ${url.pathname}`;
  });
}

const subscriptionOnTheCustomer = (id: string, status: string) =>
  stripeSubscription({ id, userId: USER_ID, customerId: CUSTOMER_ID, status });

const storeAsTheSubscriptionWebhookWould = (id: string, status: string) =>
  storeSubscriptionRow(d1, { id, userId: USER_ID, customerId: CUSTOMER_ID, status });

function declinePaymentLeavingItsSubscriptionIncomplete(session: StripeSession, subscriptionId: string, { stored = true } = {}) {
  session.subscription = subscriptionId;
  subscriptionsStripeLists.push(subscriptionOnTheCustomer(subscriptionId, "incomplete"));
  if (stored) storeAsTheSubscriptionWebhookWould(subscriptionId, "incomplete");
}

const openSessions = () => sessions.filter((session) => session.status === "open");
const sessionCreates = () => stripeCalls().filter((call) => call === "POST /v1/checkout/sessions");

const addSessionWithoutThisCheckoutsParams = () => addSession({ metadata: { userId: USER_ID } });

function advanceMinutes(minutes: number) {
  vi.setSystemTime(Date.now() + minutes * 60_000);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
  d1 = new SqliteD1({ schemaSql: billingSchemaSql() });
  seedBillingUser(d1, USER_ID, CUSTOMER_ID);
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  sessions = [];
  idempotentResponses = new Map();
  nextSessionId = 0;
  subscriptionsStripeLists = [];
  sessionListOverride = null;
  whileStripeExpiresTheSession = null;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => stripeMock(input, init));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  d1.close();
});

describe("POST /api/billing/checkout with an open Checkout Session", () => {
  it("sends an Upgrade in a later idempotency window to the session still open in another tab instead of opening a second one", async () => {
    const first = await checkout();
    advanceMinutes(7);
    fetchMock.mockClear();

    const second = await checkout();

    expect(first.status).toBe(200);
    expect(second.status).toBe(200);
    expect(second.body.url).toBe(first.body.url);
    expect(openSessions()).toHaveLength(1);
    expect(sessionCreates()).toEqual([]);
  });

  it("asks Stripe only for this customer's open sessions", async () => {
    await checkout();

    const listCall = firstOf(fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/v1/checkout/sessions"));
    expect(listCall.searchParams.get("customer")).toBe(CUSTOMER_ID);
    expect(listCall.searchParams.get("status")).toBe("open");
  });

  it("expires an open session that does not match this checkout, then opens a new one", async () => {
    const stale = addSessionWithoutThisCheckoutsParams();

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(stale.status).toBe("expired");
    expect(result.body.url).not.toBe(`https://checkout.stripe.test/${stale.id}`);
    expect(openSessions()).toHaveLength(1);
    const calls = stripeCalls();
    expect(calls.indexOf(`POST /v1/checkout/sessions/${stale.id}/expire`)).toBeLessThan(
      calls.lastIndexOf("POST /v1/checkout/sessions"),
    );
  });

  it("replaces a matching session that expires within the hour", async () => {
    await checkout();
    const nearlyDone = firstOf(sessions);
    advanceMinutes(24 * 60 - 30);

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(nearlyDone.status).toBe("expired");
    expect(result.body.url).not.toBe(`https://checkout.stripe.test/${nearlyDone.id}`);
    expect(openSessions()).toHaveLength(1);
  });

  it("keeps the newest matching session and expires every other one", async () => {
    await checkout();
    advanceMinutes(10);
    const firstSession = firstOf(sessions);
    const newerSessionLeftFromBeforeThisCheck = addSession({ metadata: { ...firstSession.metadata } });
    advanceMinutes(10);

    const result = await checkout();

    expect(result.body.url).toBe(`https://checkout.stripe.test/${newerSessionLeftFromBeforeThisCheck.id}`);
    expect(firstSession.status).toBe("expired");
    expect(openSessions().map((session) => session.id)).toEqual([newerSessionLeftFromBeforeThisCheck.id]);
  });

  it("leaves open sessions that cannot start a subscription alone", async () => {
    const payment = addSession({ mode: "payment" });

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(payment.status).toBe("open");
  });

  it("expires open sessions before checking Stripe for a subscription, and sells nothing when one exists", async () => {
    const stale = addSession();
    subscriptionsStripeLists = [subscriptionOnTheCustomer("sub_paid", "active")];

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(stale.status).toBe("expired");
    expect(sessionCreates()).toEqual([]);
  });

  it("does not reuse a matching session when Stripe shows a subscription", async () => {
    await checkout();
    subscriptionsStripeLists = [subscriptionOnTheCustomer("sub_paid", "active")];

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
  });

  it("returns 409 checkout_in_progress when a session completes while it is being expired", async () => {
    addSession();
    whileStripeExpiresTheSession = (session) => {
      session.status = "complete";
    };

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("checkout_in_progress");
    expect(sessionCreates()).toEqual([]);
  });

  it("fails closed with 503 when Stripe cannot list open sessions", async () => {
    sessionListOverride = () => jsonResponse({ error: { type: "api_error" } }, 500);

    const result = await checkout();

    expect(result.status).toBe(503);
    expect(result.body.code).toBe("billing_unavailable");
    expect(sessionCreates()).toEqual([]);
  });

  it("fails closed when the open-session list is incomplete or malformed", async () => {
    sessionListOverride = () => jsonResponse({ object: "list", data: [], has_more: true });
    expect((await checkout()).status).toBe(503);

    sessionListOverride = () => jsonResponse({ object: "list", data: [{ id: "cs_x" }], has_more: false });
    expect((await checkout()).status).toBe(503);

    expect(sessionCreates()).toEqual([]);
  });
});

describe("POST /api/billing/checkout after a first payment did not go through, which only a retry in its session can pay", () => {
  it("sends the buyer back to the session that holds the incomplete subscription", async () => {
    const first = await checkout();
    declinePaymentLeavingItsSubscriptionIncomplete(firstOf(sessions), "sub_1");
    advanceMinutes(10);
    fetchMock.mockClear();

    const retry = await checkout();

    expect(retry.status).toBe(200);
    expect(retry.body.url).toBe(first.body.url);
    expect(sessionCreates()).toEqual([]);
    expect(stripeCalls().some((call) => call.endsWith("/expire"))).toBe(false);
    expect(openSessions()).toHaveLength(1);
  });

  it("does the same before the webhook has stored the subscription", async () => {
    const first = await checkout();
    declinePaymentLeavingItsSubscriptionIncomplete(firstOf(sessions), "sub_1", { stored: false });
    advanceMinutes(10);

    const retry = await checkout();

    expect(retry.status).toBe(200);
    expect(retry.body.url).toBe(first.body.url);
  });

  it("replaces a session about to expire once expiring it has canceled its subscription", async () => {
    await checkout();
    const declined = firstOf(sessions);
    declinePaymentLeavingItsSubscriptionIncomplete(declined, "sub_1");
    advanceMinutes(24 * 60 - 30);

    const retry = await checkout();

    expect(retry.status).toBe(200);
    expect(declined.status).toBe("expired");
    expect(retry.body.url).not.toBe(`https://checkout.stripe.test/${declined.id}`);
    expect(openSessions()).toHaveLength(1);
  });

  it("refuses without the Customer Portal while an incomplete subscription has no open session, as when a first payment is processing", async () => {
    subscriptionsStripeLists = [subscriptionOnTheCustomer("sub_1", "incomplete")];
    storeAsTheSubscriptionWebhookWould("sub_1", "incomplete");

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("checkout_incomplete");
    expect(sessionCreates()).toEqual([]);
  });

  it("does not reuse the session when another subscription is paid", async () => {
    await checkout();
    declinePaymentLeavingItsSubscriptionIncomplete(firstOf(sessions), "sub_1");
    subscriptionsStripeLists.push(subscriptionOnTheCustomer("sub_paid", "active"));

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
  });

  it("keeps sending a failed renewal to the Customer Portal even with a session open", async () => {
    await checkout();
    declinePaymentLeavingItsSubscriptionIncomplete(firstOf(sessions), "sub_1");
    subscriptionsStripeLists.push(subscriptionOnTheCustomer("sub_old", "past_due"));

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("subscription_needs_attention");
  });

  it("refuses without a Stripe customer to check", async () => {
    d1.sqlite.exec("DELETE FROM stripe_customers");
    storeAsTheSubscriptionWebhookWould("sub_1", "incomplete");

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("checkout_incomplete");
    expect(stripeCalls()).toEqual([]);
  });
});
