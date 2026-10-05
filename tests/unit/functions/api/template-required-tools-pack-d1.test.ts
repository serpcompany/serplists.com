import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createTemplateAs,
  d1,
  ONE_TASK,
  openTheToolsDatabase,
  runsApi,
  SLIDESHOW_APP,
  storedColumns,
  templatesApi,
  TIME_TRACKER,
  TOOLS_SEEDED_AT,
} from "../../../support/requiredToolsSqlite";
import { PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION } from "@/lib/schemas/checklistSchema";
import { REQUIRED_TOOL_NAME_MAX } from "@/lib/schemas/requiredTools";
import { onlyElement } from "../../../support/elements";
import { jsonObject, readJson } from "../../../support/readJson";

const THE_TOOLS = [TIME_TRACKER, SLIDESHOW_APP];
const exportedPack = z.object({ templates: z.array(z.object({ title: z.string(), requiredTools: z.unknown() }).passthrough()) }).passthrough();
const importSummary = z.object({
  imported: z.number(),
  successes: z.array(z.object({ index: z.number(), id: z.string() }).passthrough()),
  failed: z.array(z.object({ index: z.number(), code: z.string(), reason: z.string() }).passthrough()),
}).passthrough();
const sourceTemplateOfRun = z.object({
  provenance: z.object({ template: z.object({ title: z.string().nullable(), requiredTools: z.unknown() }).passthrough() }).passthrough(),
}).passthrough();

const pack = (templates: unknown[]) => ({
  kind: "serplists-template-pack",
  schemaVersion: PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION,
  exportedAt: TOOLS_SEEDED_AT,
  templates,
});

const exportedTemplates = async (query = "") => {
  const response = await templatesApi("alice", "GET", `/backup${query}`);
  expect(response.status).toBe(200);
  return Object.fromEntries((await readJson(response, exportedPack)).templates.map((template) => [template.title, template]));
};

const importAs = async (templates: unknown) => {
  const response = await templatesApi("alice", "POST", "/backup", templates);
  return readJson(response, importSummary);
};

describe("Required tools in portable packs and backups", () => {
  beforeEach(openTheToolsDatabase);
  afterEach(() => d1.close());

  it("exports a Template's tools in the portable pack and the backup, and no empty list for a Template without them", async () => {
    await createTemplateAs("alice", { title: "With tools", requiredTools: THE_TOOLS });
    await createTemplateAs("alice", { title: "Without tools" });

    const portable = await exportedTemplates();
    expect(portable["With tools"]?.requiredTools).toEqual(THE_TOOLS);
    expect(portable["Without tools"]).not.toHaveProperty("requiredTools");
    expect((await exportedTemplates("?format=backup"))["With tools"]?.requiredTools).toEqual(THE_TOOLS);
  });

  it("imports the tools a pack holds, and refuses only the Template whose tools it cannot store", async () => {
    const summary = await importAs(pack([
      { title: "Imported with tools", sections: ONE_TASK, requiredTools: [TIME_TRACKER, { name: "Timer", url: "https://example.com/timer" }] },
      { title: "Unsafe link", sections: ONE_TASK, requiredTools: [{ name: "Script", url: "javascript:alert(1)", required: true }] },
      { title: "Long name", sections: ONE_TASK, requiredTools: [{ ...TIME_TRACKER, name: "n".repeat(REQUIRED_TOOL_NAME_MAX + 1) }] },
    ]));

    expect(summary.imported).toBe(1);
    expect(storedColumns(onlyElement(summary.successes).id).required_tools).toBe(
      JSON.stringify([TIME_TRACKER, { name: "Timer", url: "https://example.com/timer", required: true }]),
    );
    expect(summary.failed.map(({ index, code }) => [index, code])).toEqual([[1, "invalid_sections"], [2, "invalid_fields"]]);
    expect(summary.failed[1]?.reason).toBe("requiredTools.0.name: Tool names must be 80 characters or fewer");
  });

  it("imports the tools of a backup export, which round-trips them", async () => {
    await createTemplateAs("alice", { title: "Round trip", requiredTools: THE_TOOLS });
    const backup = await readJson(await templatesApi("alice", "GET", "/backup?format=backup"), jsonObject);

    const summary = await importAs(backup);

    expect(storedColumns(onlyElement(summary.successes).id).required_tools).toBe(JSON.stringify(THE_TOOLS));
  });
});

describe("the source Template's Required tools on a Run, shown only where the viewer may use that Template", () => {
  beforeEach(() => {
    openTheToolsDatabase();
    const tools = JSON.stringify(THE_TOOLS);
    const template = (id: string, userId: string, isPublic: number) =>
      d1.run(
        `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, created_by_user_id,
          content_version, required_tools) VALUES (?, ?, ?, ?, ?, ?, 1, 'checklist', 'user', ?, 1, ?)`,
        id, userId, `Source ${id}`, JSON.stringify(ONE_TASK), isPublic, TOOLS_SEEDED_AT, userId, tools,
      );
    const run = (id: string, userId: string, teamId: string | null, templateId: string) =>
      d1.run(
        `INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, created_at, progress,
          created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public)
         VALUES (?, ?, ?, ?, 'Run', ?, 'in_progress', ?, ?, 0, ?, ?, 1, 1, '[]', 0)`,
        id, userId, teamId, templateId, JSON.stringify(ONE_TASK), TOOLS_SEEDED_AT, TOOLS_SEEDED_AT, userId, userId,
      );
    template("alice-private", "alice", 0);
    template("carol-public", "carol", 1);
    run("alice-personal-run", "alice", null, "alice-private");
    run("organization-run", "alice", "org-1", "alice-private");
    run("bob-run-of-a-public-template", "bob", null, "carol-public");
  });
  afterEach(() => d1.close());

  const sourceOf = async (userId: string, runId: string) => {
    const response = await runsApi(userId, `/${runId}`);
    expect(response.status).toBe(200);
    return (await readJson(response, sourceTemplateOfRun)).provenance.template;
  };

  it("shows the tools of the viewer's own Template and of a public one", async () => {
    expect(await sourceOf("alice", "alice-personal-run")).toMatchObject({ title: "Source alice-private", requiredTools: THE_TOOLS });
    expect(await sourceOf("alice", "organization-run")).toMatchObject({ requiredTools: THE_TOOLS });
    expect(await sourceOf("bob", "bob-run-of-a-public-template")).toMatchObject({ title: "Source carol-public", requiredTools: THE_TOOLS });
  });

  it("hides the tools of a source Template the viewer may not see, as it hides its title", async () => {
    expect(await sourceOf("bob", "organization-run")).toMatchObject({ title: null, requiredTools: [] });
  });

  it("stops showing them once the source Template is deleted", async () => {
    d1.run("UPDATE templates SET deleted_at = ? WHERE id = 'carol-public'", TOOLS_SEEDED_AT);

    expect(await sourceOf("bob", "bob-run-of-a-public-template")).toMatchObject({ title: null, requiredTools: [] });
  });
});
