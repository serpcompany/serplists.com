import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import "../../../support/mockedSession";
import { openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, readJson } from "../../../support/readJson";
import { logLineIn, storedSectionsIn } from "../../../support/storedJson";
import { onlyElement } from "../../../support/elements";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const create = (body: unknown) => handleTemplates(apiRequest("templates", "POST", body), apiEnvOn(database));
const createdTemplates = () => database.rows("SELECT title, slug, items FROM templates WHERE id <> 'template-1'");

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
  database.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', '2026-10-01T00:00:00.000Z')");
});

afterEach(() => {
  vi.restoreAllMocks();
  database.sqlite.close();
});

describe("creating a Template, refused before anything is written", () => {
  it.each([
    ["sections that are not a list", { title: "Launch", sections: "nope" }, "sections/items must be a JSON array"],
    [
      "two sections with one id",
      { title: "Launch", sections: [{ id: "s1", title: "A", items: [] }, { id: "s1", title: "B", items: [] }] },
      "Duplicate section id: s1",
    ],
  ])("answers 400 for %s", async (_label, body, error) => {
    const response = await create(body);

    expect(response.status).toBe(400);
    expect((await readJson(response, apiErrorBody)).error).toBe(error);
    expect(createdTemplates()).toEqual([]);
  });
});

describe("Templates the API creates", () => {
  it("takes the slug from the one requested and the sections from the older items key", async () => {
    const response = await create({ title: "Launch", slug: "  launch-plan ", items: [{ id: "s1", title: "A", items: [] }] });

    expect(response.status).toBe(200);
    const created = onlyElement(createdTemplates());
    expect(created.slug).toBe("launch-plan");
    expect(storedSectionsIn(created.items).map(({ id }) => id)).toEqual(["s1"]);
  });

  it("creates a Template with a title the tests of old left behind, and warns about it in the log", async () => {
    const warn = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect((await create({ title: "Test Template" })).status).toBe(200);
    expect(createdTemplates()).toMatchObject([{ title: "Test Template" }]);
    expect(warn.mock.calls.map(([line]) => logLineIn(line).message)).toContain("junk_template_title_created");
  });
});
