import { drizzle } from "drizzle-orm/d1";
import { afterEach, describe, expect, it, vi } from "vitest";

import * as schema from "../../../../db/schema/index";
import { readLocalSeedStatus } from "../../../../db/seeds/local";
import { D1DatabaseDouble, D1StatementDouble, d1Result } from "../../../support/d1Doubles";

const SEED_IDS = "../../../../db/seeds/local-test-data/ids";

class StatementWithNoRows extends D1StatementDouble {
  protected async allRows() {
    return d1Result([]);
  }

  protected async rawRows() {
    return [];
  }
}

class D1ThatAnswersEveryQueryWithNoRows extends D1DatabaseDouble {
  readonly queries: string[] = [];

  prepare(sql: string): StatementWithNoRows {
    this.queries.push(sql);
    return new StatementWithNoRows(sql);
  }
}

class StatementThatFails extends D1StatementDouble {
  constructor(
    sql: string,
    private readonly reason: unknown,
  ) {
    super(sql);
  }

  protected allRows(): Promise<never> {
    return Promise.reject<never>(this.reason);
  }

  protected rawRows(): Promise<never> {
    return Promise.reject<never>(this.reason);
  }
}

class D1WhoseQueriesFailWith extends D1DatabaseDouble {
  constructor(private readonly reason: unknown) {
    super();
  }

  prepare(sql: string): StatementThatFails {
    return new StatementThatFails(sql, this.reason);
  }
}

class D1ThatCannotPrepare extends D1DatabaseDouble {
  constructor(private readonly reason: unknown) {
    super();
  }

  prepare(): never {
    throw this.reason;
  }
}

const NOTHING_SEEDED = { testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: false };

afterEach(() => {
  vi.doUnmock(SEED_IDS);
  vi.resetModules();
});

describe("the local seed's status", () => {
  it("reads a database that answers its counts with no rows as holding nothing the seed writes", async () => {
    const database = new D1ThatAnswersEveryQueryWithNoRows();

    const status = await readLocalSeedStatus(drizzle(database, { schema }));

    expect(status).toEqual({ testData: false, officialTemplates: false, officialLogin: false, legacyTestSlugs: false });
    expect(database.queries).toHaveLength(5);
    expect(database.queries.every((sql) => sql.startsWith("select count(*)"))).toBe(true);
  });

  it("reads a database whose tables don't exist yet as holding nothing the seed writes, as D1 reports it when a query runs", async () => {
    const database = new D1WhoseQueriesFailWith(new Error("D1_ERROR: no such table: users: SQLITE_ERROR"));

    await expect(readLocalSeedStatus(drizzle(database, { schema }))).resolves.toEqual(NOTHING_SEEDED);
  });

  it("reads a database whose tables don't exist yet as holding nothing the seed writes, when it says so with something other than an Error", async () => {
    const database = new D1ThatCannotPrepare("no such table: users");

    await expect(readLocalSeedStatus(drizzle(database, { schema }))).resolves.toEqual(NOTHING_SEEDED);
  });

  it("passes on a failed query that names no missing table, even one that gives no reason", async () => {
    const database = new D1WhoseQueriesFailWith(undefined);

    await expect(readLocalSeedStatus(drizzle(database, { schema }))).rejects.toThrow(/^Failed query: select count\(\*\)/);
  });

  it("passes on a database that can't prepare its queries for a reason other than a missing table", async () => {
    const database = new D1ThatCannotPrepare("the database is locked");

    await expect(readLocalSeedStatus(drizzle(database, { schema }))).rejects.toBe("the database is locked");
  });

  it("refuses to load when no audit event is listed to mark the local seed complete", async () => {
    vi.resetModules();
    vi.doMock(SEED_IDS, async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../../db/seeds/local-test-data/ids")>()), TEST_AUDIT_IDS: [] }));

    await expect(import("../../../../db/seeds/local")).rejects.toThrow("TEST_AUDIT_IDS is empty, so no audit event marks the local seed complete");
  });
});
