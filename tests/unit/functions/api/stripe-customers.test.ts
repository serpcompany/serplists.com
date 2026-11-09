import { afterEach, describe, expect, it, vi } from "vitest";
import { createDb } from "@functions/api/db";
import { createStripeCustomer } from "@functions/api/utils/stripe-customers";
import { shortDigest } from "@functions/api/utils/stripe";
import { apiEnv } from "../../../support/apiEnv";
import { firstOf } from "../../../support/elements";
import { SqliteD1 } from "../../../support/sqlite-d1";

afterEach(() => {
  vi.unstubAllGlobals();
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
