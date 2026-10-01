import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { buildConsoleSettingsPath } from "@/lib/routes";
import { billingSchemaSql, emptyStripeList, postToBilling, seedBillingUser, stripeBillingEnv } from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";

const sessionMocks = vi.hoisted(() => ({ getSessionUserId: vi.fn() }));
vi.mock("@functions/api/utils/session", () => ({ getSessionUserId: sessionMocks.getSessionUserId }));

const ORIGIN = "https://serplists.test";

let d1: SqliteD1;
let fetchMock: ReturnType<typeof vi.fn>;

const env = () => stripeBillingEnv(d1, { FRONTEND_URL: ORIGIN });

function sentForm(): URLSearchParams {
  const [, init] = fetchMock.mock.calls.find(([, call]) => (call as RequestInit).method === "POST") as [
    string,
    RequestInit,
  ];
  return new URLSearchParams(String(init.body));
}

beforeEach(() => {
  d1 = new SqliteD1({ schemaSql: billingSchemaSql() });
  seedBillingUser(d1, "user-1", "cus_1");
  sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if ((init?.method ?? "GET") === "GET") return emptyStripeList();
    return new Response(JSON.stringify({ id: "session_1", url: "https://stripe.test/session_1" }));
  });
  vi.stubGlobal("fetch", fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
  d1.close();
});

describe("Stripe return URLs, which are the settings page itself so no redirect can drop the ?billing= result", () => {
  it("returns Checkout to the settings page the app builds, with the billing result", async () => {
    const response = await postToBilling(env(), "checkout");

    expect(response.status).toBe(200);
    expect(sentForm().get("success_url")).toBe(`${ORIGIN}${buildConsoleSettingsPath()}?billing=success`);
    expect(sentForm().get("cancel_url")).toBe(`${ORIGIN}${buildConsoleSettingsPath()}?billing=cancel`);
    expect(sentForm().get("line_items[0][price]")).toBe("price_pro");
  });

  it("returns the Customer Portal to the settings page the app builds", async () => {
    const response = await postToBilling(env(), "portal");

    expect(response.status).toBe(200);
    expect(sentForm().get("return_url")).toBe(`${ORIGIN}${buildConsoleSettingsPath()}`);
  });
});
