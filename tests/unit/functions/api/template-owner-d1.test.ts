import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import { sessionMocks } from "../../../support/mockedSession";

import { schema } from "@functions/api/db";
import { handleTemplates } from "@functions/api/handlers/templates";
import { selectTemplatesWithOwner } from "@functions/api/utils/template-rows";
import { eq } from "drizzle-orm";
import { apiEnv, apiEnvOn, d1ThatRunsNoQuery } from "../../../support/apiEnv";
import { readJson } from "../../../support/readJson";
import { SqliteD1, toSqliteValue } from "../../../support/sqlite-d1";

const ITEMS = JSON.stringify([{ id: "s1", title: "Section", items: [{ id: "i1", title: "Task" }] }]);

const templateBody = z
  .object({ id: z.string(), user_id: z.unknown(), owner_username: z.unknown(), owner: z.unknown() })
  .passthrough();
const templateList = z.array(templateBody);

const THE_ORGANIZATION = { type: "team", teamId: "org-1", publicHandle: "acme-launch", displayName: "Acme Launch Team" };
const THE_ORGANIZATION_IN_PUBLIC = { type: "team", publicHandle: "acme-launch", displayName: "Acme Launch Team" };
const THE_ORGANIZATION_BY_ID = /org-1/;
const THE_PERSONAL_OWNER = { type: "user", userId: "owner-2", publicHandle: "bob", displayName: "Bob Owner" };

type StoredTemplate = { id: string; userId: string; ownerType: "user" | "team"; teamId: string | null; createdAt: string };

describe("the owner of a Template in API responses, read from its stored owner type and Organization", () => {
  let database: SqliteD1;

  const exec = (query: string, ...params: Array<string | number | null>) => database.sqlite.prepare(query).run(...params);

  const storeTemplate = ({ id, userId, ownerType, teamId, createdAt }: StoredTemplate) =>
    exec(
      `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
        created_by_user_id, slug, content_version)
       VALUES (?, ?, ?, ?, 1, ?, 1, 'checklist', ?, ?, ?, ?, 1)`,
      id, userId, `Template ${id}`, ITEMS, createdAt, ownerType, teamId, userId, id,
    );

  const read = async (path: string, viewer: string | null) => {
    sessionMocks.getSessionUserId.mockResolvedValue(viewer);
    const response = await handleTemplates(new Request(`http://localhost/api/${path}`), apiEnvOn(database));
    expect(response.status).toBe(200);
    return response;
  };
  const listed = async (path: string, viewer: string | null) => readJson(await read(path, viewer), templateList);
  const detail = async (path: string, viewer: string | null) => readJson(await read(path, viewer), templateBody);

  beforeEach(() => {
    database = new SqliteD1();
    exec(
      `INSERT INTO users (id, email, name, username, email_verified, created_at) VALUES
        ('creator-1', 'creator@example.test', 'Alice Creator', 'alice', 1, '2026-01-01'),
        ('owner-2', 'owner@example.test', 'Bob Owner', 'bob', 1, '2026-01-01')`,
    );
    exec(
      `INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at)
       VALUES ('org-1', 'Acme Launch Team', 'acme-launch', 'creator-1', 'creator-1', '2026-01-01')`,
    );
    exec(
      `INSERT INTO team_members (id, team_id, user_id, role, status, created_at)
       VALUES ('member-1', 'org-1', 'creator-1', 'editor', 'active', '2026-01-01')`,
    );
    storeTemplate({ id: "personal-1", userId: "owner-2", ownerType: "user", teamId: null, createdAt: "2026-02-01" });
    storeTemplate({ id: "organization-1", userId: "creator-1", ownerType: "team", teamId: "org-1", createdAt: "2026-02-02" });
  });

  afterEach(() => {
    database.sqlite.close();
  });

  it("names the User for a Personal Template and the Organization by its handle and name for an Organization Template in the public catalog", async () => {
    const catalog = await listed("templates?scope=public", null);

    expect(catalog.map(({ id, owner }) => [id, owner])).toEqual([
      ["organization-1", THE_ORGANIZATION_IN_PUBLIC],
      ["personal-1", THE_PERSONAL_OWNER],
    ]);
  });

  it.each([
    ["a member's read by id", "detail", "templates/organization-1", "creator-1"],
    ["a member's read by slug", "detail", "templates/slug/organization-1", "creator-1"],
    ["the Organization's list", "list", "templates?teamId=org-1", "creator-1"],
  ])("names the Organization, never the Creator, as the owner of an Organization Template in %s", async (_label, kind, path, viewer) => {
    const body = kind === "list" ? await listed(path, viewer) : [await detail(path, viewer)];
    const template = body.find(({ id }) => id === "organization-1");

    expect(template?.owner).toEqual(THE_ORGANIZATION);
    expect(template).toMatchObject({ user_id: "creator-1", owner_username: "alice" });
  });

  it.each([
    ["the public catalog", "templates?scope=public", null],
    ["a visitor's read by slug", "templates/slug/organization-1", null],
    ["a visitor's read by id", "templates/organization-1", null],
    ["a read by id from someone outside the Organization", "templates/organization-1", "owner-2"],
  ])("names the Organization by its public handle and name, never its id, and never makes the Creator the owner of an Organization Template in %s", async (_label, path, viewer) => {
    const response = await read(path, viewer);
    const sent = await response.clone().text();
    const body = await readJson(response, z.union([templateList, templateBody.transform((template) => [template])]));
    const template = body.find(({ id }) => id === "organization-1");

    expect(template?.owner).toEqual(THE_ORGANIZATION_IN_PUBLIC);
    expect(template).toMatchObject({ user_id: "creator-1", owner_username: "alice" });
    expect(template).not.toHaveProperty("team_id");
    expect(sent).not.toMatch(THE_ORGANIZATION_BY_ID);
  });

  it("sends the Organization's name and slug only inside the owner, not as columns of the row", async () => {
    const template = await detail("templates/organization-1", "creator-1");

    expect(template).toHaveProperty("team_id", "org-1");
    expect(template).not.toHaveProperty("owner_team_slug");
    expect(template).not.toHaveProperty("owner_team_name");
  });

  it("keeps a Personal Template that still names an Organization its User's", async () => {
    storeTemplate({ id: "personal-2", userId: "owner-2", ownerType: "user", teamId: "org-1", createdAt: "2026-02-03" });

    const template = await detail("templates/personal-2", "owner-2");

    expect(template.owner).toEqual(THE_PERSONAL_OWNER);
  });

  it("finds the owning Organization by its primary key", () => {
    const { sql, params } = selectTemplatesWithOwner(apiEnv({ DB: d1ThatRunsNoQuery() }))
      .where(eq(schema.templates.is_public, true))
      .toSQL();
    const plan = database.sqlite
      .prepare(`EXPLAIN QUERY PLAN ${sql}`)
      .all(...params.map(toSqliteValue))
      .map(({ detail: step }) => step);

    expect(plan).toContain("SEARCH teams USING INDEX sqlite_autoindex_teams_1 (id=?) LEFT-JOIN");
  });
});
