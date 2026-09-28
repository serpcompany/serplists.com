import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";

// A Checkout Session stays payable for 24 hours and each one opens its own subscription.
// The idempotency key only joins requests in the same five-minute window, so a tab left
// on Checkout plus a later Upgrade used to leave two payable sessions: paying both
// billed the customer twice.

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

import { handleBilling } from "@functions/api/handlers/billing";

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
};

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;
let sessions: StripeSession[];
let idempotentResponses: Map<string, string>;
let nextSessionId: number;
/** What GET /v1/subscriptions returns. */
let stripeSubscriptions: unknown[];
/** Overrides the Checkout Session list response. */
let sessionListResponse: (() => Response) | null;
/** Runs when Stripe is asked to expire a session, before it answers. */
let beforeExpire: ((session: StripeSession) => void) | null;

const nowSeconds = () => Math.floor(Date.now() / 1000);

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status });
}

function metadataFrom(form: URLSearchParams): Record<string, string> {
  const metadata: Record<string, string> = {};
  for (const [key, value] of form) {
    const match = /^metadata\[(.+)\]$/.exec(key);
    if (match) metadata[match[1]] = value;
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
    ...overrides,
  };
  sessions.push(session);
  return session;
}

function stripeMock(input: RequestInfo | URL, init?: RequestInit): Response {
  const url = new URL(String(input));
  const method = init?.method ?? "GET";
  const form = new URLSearchParams(String(init?.body ?? ""));
  const idempotencyKey = (init?.headers as Record<string, string> | undefined)?.["Idempotency-Key"];

  if (method === "GET" && url.pathname === "/v1/subscriptions") {
    return jsonResponse({ object: "list", data: stripeSubscriptions, has_more: false });
  }
  if (method === "GET" && url.pathname === "/v1/checkout/sessions") {
    if (sessionListResponse) return sessionListResponse();
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
    if (session) beforeExpire?.(session);
    if (!session || session.status !== "open") {
      return jsonResponse({ error: { type: "invalid_request_error", message: "Session is not open." } }, 400);
    }
    session.status = "expired";
    session.url = null;
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

function env() {
  return {
    DB: d1.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    STRIPE_SECRET_KEY: "sk_test_open_sessions",
    STRIPE_PRO_PRICE_ID: "price_pro",
  } as never;
}

async function checkout(): Promise<{ status: number; body: Record<string, unknown> }> {
  const response = await handleBilling(
    new Request("http://localhost/api/billing/checkout", { method: "POST", body: "{}" }),
    env(),
  );
  return { status: response.status, body: await response.json() };
}

function stripeCalls(): string[] {
  return fetchMock.mock.calls.map(([input, init]) => {
    const url = new URL(String(input));
    return `${(init as RequestInit | undefined)?.method ?? "GET"} ${url.pathname}`;
  });
}

const openSessions = () => sessions.filter((session) => session.status === "open");
const sessionCreates = () => stripeCalls().filter((call) => call === "POST /v1/checkout/sessions");

function advanceMinutes(minutes: number) {
  vi.setSystemTime(Date.now() + minutes * 60_000);
}

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["Date"] });
  vi.setSystemTime(new Date("2026-09-28T10:00:00.000Z"));
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES (?, ?)").run(USER_ID, "user-1@example.test");
  d1.sqlite.prepare(`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES (?, ?, '2026-01-01T00:00:00.000Z')
  `).run(USER_ID, CUSTOMER_ID);
  sessionMocks.getSessionUserId.mockResolvedValue(USER_ID);
  sessions = [];
  idempotentResponses = new Map();
  nextSessionId = 0;
  stripeSubscriptions = [];
  sessionListResponse = null;
  beforeExpire = null;
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => stripeMock(input, init));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.useRealTimers();
  d1.close();
});

describe("POST /api/billing/checkout with an open Checkout Session", () => {
  it("sends a later Upgrade to the session already open instead of opening a second one", async () => {
    const first = await checkout();
    // The buyer leaves that tab on Checkout and clicks Upgrade again in a later window.
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

    const [listCall] = fetchMock.mock.calls
      .map(([input]) => new URL(String(input)))
      .filter((url) => url.pathname === "/v1/checkout/sessions");
    expect(listCall.searchParams.get("customer")).toBe(CUSTOMER_ID);
    expect(listCall.searchParams.get("status")).toBe("open");
  });

  it("expires an open session that does not match this checkout, then opens a new one", async () => {
    // Opened before this check existed, or for another price or return URL.
    const stale = addSession({ metadata: { userId: USER_ID } });

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
    const [nearlyDone] = sessions;
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
    // A second session left from before this check, in a later window.
    const [firstSession] = sessions;
    const newer = addSession({ metadata: { ...firstSession.metadata } });
    advanceMinutes(10);

    const result = await checkout();

    expect(result.body.url).toBe(`https://checkout.stripe.test/${newer.id}`);
    expect(firstSession.status).toBe("expired");
    expect(openSessions().map((session) => session.id)).toEqual([newer.id]);
  });

  it("leaves open sessions that cannot start a subscription alone", async () => {
    const payment = addSession({ mode: "payment" });

    const result = await checkout();

    expect(result.status).toBe(200);
    expect(payment.status).toBe("open");
  });

  it("expires open sessions before checking Stripe for a subscription, and sells nothing when one exists", async () => {
    const stale = addSession();
    stripeSubscriptions = [
      {
        id: "sub_paid",
        object: "subscription",
        customer: CUSTOMER_ID,
        status: "active",
        metadata: { userId: USER_ID },
        items: { data: [{ current_period_end: 1_900_000_000, price: { id: "price_pro" } }] },
      },
    ];

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
    expect(stale.status).toBe("expired");
    expect(sessionCreates()).toEqual([]);
  });

  it("does not reuse a matching session when Stripe shows a subscription", async () => {
    await checkout();
    stripeSubscriptions = [
      {
        id: "sub_paid",
        object: "subscription",
        customer: CUSTOMER_ID,
        status: "active",
        metadata: { userId: USER_ID },
        items: { data: [{ current_period_end: 1_900_000_000, price: { id: "price_pro" } }] },
      },
    ];

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("already_subscribed");
  });

  it("returns 409 checkout_in_progress when a session completes while it is being expired", async () => {
    addSession();
    beforeExpire = (session) => {
      session.status = "complete";
    };

    const result = await checkout();

    expect(result.status).toBe(409);
    expect(result.body.code).toBe("checkout_in_progress");
    expect(sessionCreates()).toEqual([]);
  });

  it("fails closed with 503 when Stripe cannot list open sessions", async () => {
    sessionListResponse = () => jsonResponse({ error: { type: "api_error" } }, 500);

    const result = await checkout();

    expect(result.status).toBe(503);
    expect(result.body.code).toBe("billing_unavailable");
    expect(sessionCreates()).toEqual([]);
  });

  it("fails closed when the open-session list is incomplete or malformed", async () => {
    sessionListResponse = () => jsonResponse({ object: "list", data: [], has_more: true });
    expect((await checkout()).status).toBe(503);

    sessionListResponse = () => jsonResponse({ object: "list", data: [{ id: "cs_x" }], has_more: false });
    expect((await checkout()).status).toBe(503);

    expect(sessionCreates()).toEqual([]);
  });
});
