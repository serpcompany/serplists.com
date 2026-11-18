import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import "../../../support/mockedSession";
import { insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { addOrganizationWithMember } from "../../../support/organizationRunsOnSqlite";
import { handleTemplates } from "@functions/api/handlers/templates";
import { handleChecklists } from "@functions/api/handlers/checklists";
import { apiEnvOn } from "../../../support/apiEnv";
import { apiRequest } from "../../../support/apiRequest";
import { apiErrorBody, jsonObject, readJson } from "../../../support/readJson";
import { jsonRecordIn } from "../../../support/storedJson";
import { onlyElement } from "../../../support/elements";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

const send = (path: string, method: string, body?: unknown) => handleTemplates(apiRequest(path, method, body), apiEnvOn(database));
const template = (columns: string) => onlyElement(database.rows(`SELECT ${columns} FROM templates WHERE id = 'template-1'`));
const onThePro = () =>
  database.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', '2026-10-01T00:00:00.000Z')");
const SECTION = { id: "s1", title: "Launch", items: [{ id: "t1", title: "Ship it" }] };

const backup = z.object({
  templates: z.array(z.object({ seoTitle: z.unknown(), seoDescription: z.unknown(), version: z.unknown() }).passthrough()),
}).passthrough();

beforeEach(() => {
  database = openRunOwnerDatabase(JSON.stringify([SECTION]));
});

afterEach(() => {
  database.sqlite.close();
});

describe("a Template stored with a version that is not a number, as SQLite allows", () => {
  beforeEach(() => {
    database.run("UPDATE templates SET version = 'legacy' WHERE id = 'template-1'");
  });

  it("answers a save that changes nothing as version 1", async () => {
    const response = await send("templates/template-1", "PUT", { is_public: false });

    expect(response.status).toBe(200);
    expect(await readJson(response, jsonObject)).toMatchObject({ success: true, id: "template-1", version: 1 });
  });

  it("refuses to save a change over it, since the write is guarded on version 1, and keeps it as it was", async () => {
    const response = await send("templates/template-1", "PUT", { is_public: true });

    expect(response.status).toBe(409);
    expect((await readJson(response, apiErrorBody)).error).toBe("Template changed while it was being saved. Refresh before saving again.");
    expect(template("is_public, version")).toEqual({ is_public: 0, version: "legacy" });
  });

  it("refuses to move it to an Organization, since the move is guarded on version 1, and keeps it Personal", async () => {
    addOrganizationWithMember(database, "admin");

    const response = await send("templates/template-1/transfer", "POST", { teamId: "team-1", expected_version: 1 });

    expect(response.status).toBe(409);
    expect(template("owner_type, team_id, version")).toEqual({ owner_type: "user", team_id: null, version: "legacy" });
  });

  it("backs it up as version 1", async () => {
    onThePro();

    const response = await send("templates/backup?format=backup", "GET");

    expect(response.status).toBe(200);
    expect((await readJson(response, backup)).templates).toEqual([expect.objectContaining({ version: 1 })]);
  });

  it("copies it, recording no source version", async () => {
    onThePro();
    database.run("UPDATE templates SET is_public = 1, slug = 'template' WHERE id = 'template-1'");

    expect((await send("templates/template-1/clone", "POST", {})).status).toBe(200);

    const { metadata_json: metadata } = onlyElement(database.rows("SELECT metadata_json FROM audit_events WHERE action = 'template.cloned'"));
    expect(jsonRecordIn(metadata)).toMatchObject({ sourceTemplateId: "template-1", sourceVersion: null });
  });
});

describe("a Template's runs stored with a revision that is not a number", () => {
  it("saves the Template and leaves the run as it was, since the run's write is guarded on revision 1", async () => {
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: JSON.stringify([SECTION]) });
    database.run("UPDATE checklist_runs SET revision = 'legacy' WHERE id = 'run-1'");
    const renamed = [{ ...SECTION, items: [{ id: "t1", title: "Ship it now" }] }];

    expect((await send("templates/template-1", "PUT", { sections: renamed, expected_version: 1 })).status).toBe(200);

    expect(template("version")).toEqual({ version: 2 });
    expect(onlyElement(database.rows("SELECT revision, items FROM checklist_runs WHERE id = 'run-1'")))
      .toEqual({ revision: "legacy", items: JSON.stringify([SECTION]) });
  });
});

describe("a Template stored with a content version that is not a number", () => {
  it("revalidates a run against it as template version 1", async () => {
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: JSON.stringify([SECTION]) });
    database.run("UPDATE templates SET content_version = 'legacy' WHERE id = 'template-1'");

    const response = await handleChecklists(apiRequest("checklists/run-1/revalidate", "POST", { expected_revision: 1 }), apiEnvOn(database));

    expect(await response.json()).toEqual({ success: true, progress: 0, revision: 2, template_version: 1 });
    expect(onlyElement(database.rows("SELECT revision, template_version FROM checklist_runs WHERE id = 'run-1'")))
      .toEqual({ revision: 2, template_version: 1 });
  });
});

describe("Templates with an empty title or no rules", () => {
  it("refuses an empty title and keeps the stored one", async () => {
    expect((await send("templates/template-1", "PUT", { title: "", expected_version: 1 })).status).toBe(400);

    expect(template("title")).toEqual({ title: "Template" });
  });

  it("copies a public Template with an empty title and no rules into a public copy with neither", async () => {
    onThePro();
    database.run("UPDATE templates SET is_public = 1, slug = 'template', title = '', rules = NULL WHERE id = 'template-1'");

    expect((await send("templates/template-1/clone", "POST", { visibility: "public" })).status).toBe(200);

    expect(database.rows("SELECT title, rules, is_public FROM templates WHERE id <> 'template-1'"))
      .toEqual([{ title: "", rules: null, is_public: 1 }]);
  });
});

describe("copying a public Template with rules", () => {
  it("copies its rules", async () => {
    const rules = JSON.stringify([{ id: "r1", type: "require", path: "sections[0]" }]);
    onThePro();
    database.run("UPDATE templates SET is_public = 1, slug = 'template', rules = ? WHERE id = 'template-1'", rules);

    expect((await send("templates/template-1/clone", "POST", {})).status).toBe(200);

    expect(database.rows("SELECT rules FROM templates WHERE id <> 'template-1'")).toEqual([{ rules }]);
  });
});

describe("a Template whose SEO fields hold bytes rather than text", () => {
  it("backs them up as empty text", async () => {
    onThePro();
    database.run("UPDATE templates SET seo_title = X'00', seo_description = X'01' WHERE id = 'template-1'");

    const response = await send("templates/backup?format=backup", "GET");

    expect((await readJson(response, backup)).templates).toEqual([expect.objectContaining({ seoTitle: "", seoDescription: "" })]);
  });
});
