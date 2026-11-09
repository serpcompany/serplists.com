import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@functions/api/db";
import { createStripeCustomer, replaceMissingStripeCustomer, storeFirstStripeCustomer } from "@functions/api/utils/stripe-customers";
import { shortDigest } from "@functions/api/utils/stripe";
import { apiEnv } from "../../../support/apiEnv";
import { firstOf } from "../../../support/elements";
import { SqliteD1 } from "../../../support/sqlite-d1";
import { billingSchemaSql, seedBillingUser } from "../../../support/billingCheckout";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("createStripeCustomer for a user whose account row is gone", () => {
  it("creates the customer with no email, keyed on an empty email", async () => {
    const database = new SqliteD1();
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "cus_1" }), { status: 200 }));
    vi.stubGlobal("fetch", fetchMock);

    const customerId = await createStripeCustomer(createDb(apiEnv({ DB: database.binding })), "sk_test_example", "user-gone", "customer");

    expect(customerId).toBe("cus_1");
    const [, options] = firstOf(fetchMock.mock.calls);
    expect(options?.body).toBe("metadata%5BuserId%5D=user-gone");
    expect(new Headers(options?.headers).get("Idempotency-Key")).toBe(`customer-${await shortDigest("")}`);
    database.close();
  });
});

describe("the customer a checkout keeps when the account's customer row is deleted mid-checkout", () => {
  function deleteTheCustomerRowJustBeforeItIsReadBack(database: SqliteD1) {
    database.setStatementHook((sql) => {
      if (!/^select .* from "stripe_customers"/.test(sql)) return;
      database.setStatementHook(null);
      database.run("DELETE FROM stripe_customers WHERE user_id = 'user-1'");
    });
  }

  it("keeps the customer it just stored", async () => {
    const database = new SqliteD1({ schemaSql: billingSchemaSql() });
    deleteTheCustomerRowJustBeforeItIsReadBack(database);

    expect(await storeFirstStripeCustomer(createDb(apiEnv({ DB: database.binding })), "user-1", "cus_1")).toBe("cus_1");
    database.close();
  });

  it("keeps the customer that replaced a missing one", async () => {
    const database = new SqliteD1({ schemaSql: billingSchemaSql() });
    seedBillingUser(database, "user-1", "cus_gone");
    vi.stubGlobal("fetch", vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify({ id: "cus_new" }), { status: 200 })));
    vi.spyOn(console, "warn").mockImplementation(() => {});
    deleteTheCustomerRowJustBeforeItIsReadBack(database);

    const replacement = await replaceMissingStripeCustomer(createDb(apiEnv({ DB: database.binding })), "sk_test_example", "user-1", "cus_gone");

    expect(replacement).toBe("cus_new");
    expect(database.rows("SELECT user_id FROM stripe_customers")).toEqual([]);
    database.close();
  });
});
