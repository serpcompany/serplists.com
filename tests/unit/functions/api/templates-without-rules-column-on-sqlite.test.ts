import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../support/mockedSession";
import { handleTemplates } from "@functions/api/handlers/templates";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import type { SqliteD1 } from "../../../support/sqlite-d1";
import { apiRequest } from "../../../support/apiRequest";
import { apiEnvOn } from "../../../support/apiEnv";
import { jsonObject, jsonObjects, readJson } from "../../../support/readJson";

let database: SqliteD1;

const send = (path: string, method = "GET", body?: unknown) =>
  handleTemplates(apiRequest(path, method, body), apiEnvOn(database));
const titles = () => database.rows("SELECT id, title FROM templates ORDER BY created_at, id");
const onThePro = () =>
  database.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', '2026-10-01T00:00:00.000Z')");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  database.run("ALTER TABLE templates DROP COLUMN rules");
});

afterEach(() => {
  vi.restoreAllMocks();
  database.sqlite.close();
});

describe("Templates in a database from before the rules column, which the API reads and writes without it", () => {
  it("lists and reads a Template", async () => {
    const list = await send("templates");
    const read = await send("templates/template-1");

    expect(list.status).toBe(200);
    expect(await readJson(list, jsonObjects)).toMatchObject([{ id: "template-1", title: "Template" }]);
    expect(read.status).toBe(200);
    expect(await readJson(read, jsonObject)).toMatchObject({ id: "template-1", title: "Template" });
  });

  it("creates a Template within the free plan's limit", async () => {
    database.run("DELETE FROM templates");

    const response = await send("templates", "POST", { title: "Launch", sections: [] });

    expect(response.status).toBe(200);
    expect(titles()).toMatchObject([{ title: "Launch" }]);
  });

  it("creates a Template on a plan without a limit", async () => {
    onThePro();

    const response = await send("templates", "POST", { title: "Launch", sections: [] });

    expect(response.status).toBe(200);
    expect(titles()).toMatchObject([{ id: "template-1", title: "Template" }, { title: "Launch" }]);
  });
});
