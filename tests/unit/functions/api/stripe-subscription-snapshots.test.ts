import { afterEach, assert, beforeEach, describe, expect, it, vi } from "vitest";
import {
  getPersonalSubscriptionSummary,
  loadCurrentSubscription,
  mostUrgentOpenStatus,
  parseSubscriptionSnapshot,
  refreshStoredSubscriptions,
  retrieveSubscription,
  syncCustomerSubscriptions,
} from "@functions/api/utils/stripe-subscriptions";
import {
  billingSchemaSql,
  seedBillingUser,
  storeSubscriptionRow,
  stripeBillingEnv,
  stripeErrorResponse,
  stripeSubscription,
} from "../../../support/billingCheckout";
import { SqliteD1 } from "../../../support/sqlite-d1";
import { stripeAnswers } from "../../../support/stripeReplies";

const SECRET = "sk_test_billing";
const subscription = (fields: Partial<Parameters<typeof stripeSubscription>[0]> = {}) =>
  stripeSubscription({ id: "sub_1", userId: "user-1", customerId: "cus_1", status: "active", ...fields });

const json = (body: unknown) => new Response(JSON.stringify(body));

let d1: SqliteD1;

beforeEach(() => {
  d1 = new SqliteD1({ schemaSql: billingSchemaSql() });
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
});

afterEach(() => {
  d1.close();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("mostUrgentOpenStatus", () => {
  it("picks the open status that most needs the subscriber's attention", () => {
    expect(mostUrgentOpenStatus(["trialing", "active", "canceled", "past_due"])).toBe("past_due");
    expect(mostUrgentOpenStatus(["active", "incomplete"])).toBe("incomplete");
  });

  it("ranks a status Stripe adds later after every known open status", () => {
    expect(mostUrgentOpenStatus(["a_new_status", "trialing"])).toBe("trialing");
    expect(mostUrgentOpenStatus(["a_new_status"])).toBe("a_new_status");
  });

  it("has no open status when every subscription has ended", () => {
    expect(mostUrgentOpenStatus(["canceled", "incomplete_expired"])).toBeNull();
  });
});

describe("parseSubscriptionSnapshot", () => {
  it("takes the period end from the subscription item when the subscription has none, as newer API versions send it", () => {
    expect(parseSubscriptionSnapshot(subscription())).toMatchObject({ currentPeriodEnd: 1_900_000_000, metadataUserId: "user-1" });
    expect(parseSubscriptionSnapshot({ ...subscription(), current_period_end: 1_800_000_000 })).toMatchObject({ currentPeriodEnd: 1_800_000_000 });
    expect(parseSubscriptionSnapshot({ ...subscription(), items: { data: [{ price: { id: "price_pro" } }] } })).toMatchObject({ currentPeriodEnd: null });
  });

  it("reads an empty userId in the metadata as no user", () => {
    expect(parseSubscriptionSnapshot({ ...subscription(), metadata: { userId: "" } })).toMatchObject({ metadataUserId: null });
  });

  it("has no snapshot for a body that is not a subscription", () => {
    expect(parseSubscriptionSnapshot({ id: "sub_1", object: "subscription", items: { data: [] } })).toBeNull();
  });
});

describe("retrieveSubscription", () => {
  it("has no subscription when Stripe no longer knows it", async () => {
    stripeAnswers(stripeErrorResponse(404, { type: "invalid_request_error", code: "resource_missing" }));

    await expect(retrieveSubscription(SECRET, "sub_1")).resolves.toBeNull();
  });

  it("passes on any other Stripe failure", async () => {
    stripeAnswers(stripeErrorResponse(500, { type: "api_error" }));

    await expect(retrieveSubscription(SECRET, "sub_1")).rejects.toMatchObject({ name: "StripeApiError", status: 500 });
  });

  it.each([
    ["another subscription", subscription({ id: "sub_2" })],
    ["a body that is not a subscription", { object: "subscription" }],
  ])("refuses %s in place of the one asked for", async (_label, body) => {
    stripeAnswers(json(body));

    await expect(retrieveSubscription(SECRET, "sub_1")).rejects.toThrow("Stripe returned an unexpected subscription shape");
  });
});

describe("syncCustomerSubscriptions", () => {
  it("refuses a list with an entry it cannot read, storing nothing", async () => {
    seedBillingUser(d1, "user-1", "cus_1");
    stripeAnswers(json({ object: "list", data: [subscription(), { id: "sub_2" }], has_more: false }));

    await expect(syncCustomerSubscriptions(stripeBillingEnv(d1), SECRET, "user-1", "cus_1")).rejects.toThrow(
      "Stripe returned an unexpected subscription shape",
    );
    expect(d1.rows("SELECT * FROM stripe_subscriptions")).toEqual([]);
  });
});

describe("refreshStoredSubscriptions", () => {
  it("refuses a stored subscription with no id rather than guess which one it is", async () => {
    await expect(
      refreshStoredSubscriptions(stripeBillingEnv(d1), SECRET, "user-1", [{ id: null, customerId: "cus_1", status: "active" }]),
    ).rejects.toThrow("A stored subscription has no id");
  });

  it("drops a stored subscription Stripe no longer knows and stores nothing for it", async () => {
    stripeAnswers(stripeErrorResponse(404, { code: "resource_missing" }));

    await expect(
      refreshStoredSubscriptions(stripeBillingEnv(d1), SECRET, "user-1", [{ id: "sub_1", customerId: "cus_1", status: "active" }]),
    ).resolves.toEqual([]);
  });
});

describe("loadCurrentSubscription", () => {
  it("keeps the event's userId when the current subscription has lost it from its metadata", async () => {
    stripeAnswers(json({ ...subscription(), status: "past_due", metadata: {} }));
    const event = parseSubscriptionSnapshot(subscription());
    assert.exists(event);

    await expect(loadCurrentSubscription(stripeBillingEnv(d1), event)).resolves.toMatchObject({ status: "past_due", metadataUserId: "user-1" });
  });
});

describe("getPersonalSubscriptionSummary", () => {
  it("counts only the subscriptions of the customer the user has now", async () => {
    seedBillingUser(d1, "user-1", "cus_1");
    storeSubscriptionRow(d1, { id: "sub_old", userId: "user-1", customerId: "cus_gone", status: "past_due" });
    storeSubscriptionRow(d1, { id: "sub_1", userId: "user-1", customerId: "cus_1", status: "active" });

    await expect(getPersonalSubscriptionSummary(stripeBillingEnv(d1), "user-1")).resolves.toEqual({ openStatus: "active", hasCustomer: true });
  });

  it("counts every open subscription of a user with no customer stored", async () => {
    seedBillingUser(d1, "user-1");
    storeSubscriptionRow(d1, { id: "sub_1", userId: "user-1", customerId: "cus_1", status: "unpaid" });

    await expect(getPersonalSubscriptionSummary(stripeBillingEnv(d1), "user-1")).resolves.toEqual({ openStatus: "unpaid", hasCustomer: false });
  });
});
