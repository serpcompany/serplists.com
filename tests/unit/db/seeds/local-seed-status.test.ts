import { drizzle } from "drizzle-orm/d1";
import { describe, expect, it } from "vitest";

import * as schema from "../../../../db/schema/index";
import { readLocalSeedStatus } from "../../../../db/seeds/local";
import { D1DatabaseDouble, D1StatementDouble } from "../../../support/d1Doubles";

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

describe("the local seed's status", () => {
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
});
