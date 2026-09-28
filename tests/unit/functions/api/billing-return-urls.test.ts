import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildConsoleSettingsPath } from "@/lib/routes";
import { billingSchemaSql, createSqliteD1, type SqliteD1 } from "./support/sqlite-d1";

// Stripe sends the user back to these URLs. They must be the settings page itself:
// a redirecting legacy path can lose the ?billing= query that Billing reacts to.

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

import { handleBilling } from "@functions/api/handlers/billing";

const ORIGIN = "https://serplists.test";

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;

function env() {
  return {
    DB: d1.binding,
    BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!",
    FRONTEND_URL: ORIGIN,
    STRIPE_SECRET_KEY: "sk_test_urls",
    STRIPE_PRO_PRICE_ID: "price_pro",
  } as never;
}

function sentForm(): URLSearchParams {
  const [, init] = fetchMock.mock.calls[0] as [string, RequestInit];
  return new URLSearchParams(String(init.body));
}

beforeEach(() => {
  d1 = createSqliteD1(billingSchemaSql());
  d1.sqlite.prepare("INSERT INTO users (id, email) VALUES ('user-1', 'user-1@example.test')").run();
  d1.sqlite.prepare(`
    INSERT INTO stripe_customers (user_id, stripe_customer_id, created_at) VALUES ('user-1', 'cus_1', '2026-01-01T00:00:00.000Z')
  `).run();
  sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  fetchMock = vi.fn(async () => new Response(JSON.stringify({ id: "session_1", url: "https://stripe.test/session_1" })));
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("Stripe return URLs", () => {
  it("returns Checkout to the settings page with the billing result", async () => {
    const response = await handleBilling(
      new Request("http://localhost/api/billing/checkout", { method: "POST", body: "{}" }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(sentForm().get("success_url")).toBe(`${ORIGIN}${buildConsoleSettingsPath()}?billing=success`);
    expect(sentForm().get("cancel_url")).toBe(`${ORIGIN}${buildConsoleSettingsPath()}?billing=cancel`);
    expect(sentForm().get("line_items[0][price]")).toBe("price_pro");
  });

  it("returns the Customer Portal to the settings page", async () => {
    const response = await handleBilling(
      new Request("http://localhost/api/billing/portal", { method: "POST", body: "{}" }),
      env(),
    );

    expect(response.status).toBe(200);
    expect(sentForm().get("return_url")).toBe(`${ORIGIN}${buildConsoleSettingsPath()}`);
  });
});
