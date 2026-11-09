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

  it("refuses to load when no audit event is listed to mark the local seed complete", async () => {
    vi.resetModules();
    vi.doMock(SEED_IDS, async (importOriginal) => ({ ...(await importOriginal<typeof import("../../../../db/seeds/local-test-data/ids")>()), TEST_AUDIT_IDS: [] }));

    await expect(import("../../../../db/seeds/local")).rejects.toThrow("TEST_AUDIT_IDS is empty, so no audit event marks the local seed complete");
  });
});
