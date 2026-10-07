import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  createTemplateAs,
  d1,
  ONE_TASK,
  openTheToolsDatabase,
  readTemplateAs,
  saveTemplateAs,
  SLIDESHOW_APP,
  storedColumns,
  templatesApi,
  TIME_TRACKER,
  TOOLS_SEEDED_AT,
  toolsOf,
  versionSnapshot,
} from "../../../support/requiredToolsSqlite";
import { onlyElement } from "../../../support/elements";
import { readJson } from "../../../support/readJson";

const THE_TOOLS = [TIME_TRACKER, SLIDESHOW_APP];
const listed = z.array(z.object({ id: z.string() }).passthrough());
const copied = z.object({ id: z.string() });
const refusal = z.object({ error: z.string(), code: z.string().optional(), details: z.unknown() }).passthrough();

const toolsRead = async (userId: string | null, path: string) => toolsOf.parse(await readTemplateAs(userId, path)).requiredTools;

const snapshotTools = (templateId: string, version: number) =>
  z.object({ required_tools: z.string().nullable() }).passthrough().parse(versionSnapshot(templateId, version)).required_tools;

describe("Required tools on a Template, stored in templates.required_tools (migration 0031)", () => {
  beforeEach(openTheToolsDatabase);
  afterEach(() => d1.close());

  it("stores the tools a create sends and returns them on the Template's own reads: to its owner, and to anyone once it is public", async () => {
    const templateId = await createTemplateAs("alice", { title: "Tools launch plan", requiredTools: THE_TOOLS, is_public: true });
    const { slug } = onlyElement(d1.rows<{ slug: string }>("SELECT slug FROM templates WHERE id = ?", templateId));

    expect(await toolsRead("alice", `/${templateId}`)).toEqual(THE_TOOLS);
    expect(await toolsRead(null, `/${templateId}`)).toEqual(THE_TOOLS);
    expect(await toolsRead(null, `/slug/${slug}`)).toEqual(THE_TOOLS);
    expect(storedColumns(templateId).required_tools).toBe(JSON.stringify(THE_TOOLS));
  });

  it("answers an empty list for a Template without tools, and stores nothing for it", async () => {
    const templateId = await createTemplateAs("alice", { title: "No tools" });

    expect(await toolsRead("alice", `/${templateId}`)).toEqual([]);
    expect(storedColumns(templateId).required_tools).toBeNull();
  });

  it("leaves the tools out of every list, which reads no more than it shows", async () => {
    await createTemplateAs("alice", { title: "Public tools", requiredTools: THE_TOOLS, is_public: true });
    await createTemplateAs("alice", { title: "Organization tools", requiredTools: THE_TOOLS, teamId: "org-1" });

    for (const path of ["?scope=public", "?scope=personal", "?teamId=org-1", "/public?userId=alice"]) {
      const response = await templatesApi("alice", "GET", path);
      const rows = await readJson(response, listed);
      expect(rows.length, path).toBeGreaterThan(0);
      for (const row of rows) expect(row, path).not.toHaveProperty("requiredTools");
    }
  });

  it("refuses a tool it cannot store and names the field, so nothing unsafe is ever linked", async () => {
    const response = await templatesApi("alice", "POST", "", {
      title: "Unsafe",
      sections: ONE_TASK,
      requiredTools: [{ name: "Script", url: "javascript:alert(1)", required: true }],
    });

    expect(response.status).toBe(400);
    const body = await readJson(response, refusal);
    expect(body.error).toBe("requiredTools: Tool URLs must start with http:// or https://");
    expect(body.details).toEqual({ field: "requiredTools" });
  });

  it("saves changed tools as a new version whose snapshot holds them, without a structure change that would stale Runs", async () => {
    const templateId = await createTemplateAs("alice", { title: "Versioned", requiredTools: [TIME_TRACKER] });

    const saved = await saveTemplateAs("alice", templateId, { requiredTools: THE_TOOLS, expected_version: 1 });

    expect(saved).toMatchObject({ status: 200, body: { version: 2, content_version: 1, structureChanged: false } });
    expect(storedColumns(templateId)).toEqual({ required_tools: JSON.stringify(THE_TOOLS), version: 2, content_version: 1 });
    expect(snapshotTools(templateId, 1)).toBe(JSON.stringify([TIME_TRACKER]));
    expect(snapshotTools(templateId, 2)).toBe(JSON.stringify(THE_TOOLS));
  });

  it("keeps the tools through a save that leaves them out, as the editor's saves before #241 and every MCP update do", async () => {
    const templateId = await createTemplateAs("alice", { title: "Kept", requiredTools: THE_TOOLS });

    const saved = await saveTemplateAs("alice", templateId, { title: "Kept and renamed", sections: ONE_TASK, expected_version: 1 });

    expect(saved.status).toBe(200);
    expect(await toolsRead("alice", `/${templateId}`)).toEqual(THE_TOOLS);
    expect(snapshotTools(templateId, 2)).toBe(JSON.stringify(THE_TOOLS));
  });

  it("clears the tools when a save sends an empty list", async () => {
    const templateId = await createTemplateAs("alice", { title: "Cleared", requiredTools: THE_TOOLS });

    expect((await saveTemplateAs("alice", templateId, { requiredTools: [], expected_version: 1 })).status).toBe(200);

    expect(storedColumns(templateId).required_tools).toBeNull();
    expect(await toolsRead("alice", `/${templateId}`)).toEqual([]);
  });

  it("changes nothing for a save that sends the tools already stored, and needs the loaded version to change them", async () => {
    const templateId = await createTemplateAs("alice", { title: "Guarded", requiredTools: THE_TOOLS });

    const unchanged = await saveTemplateAs("alice", templateId, { requiredTools: THE_TOOLS, expected_version: 1 });
    const unversioned = await saveTemplateAs("alice", templateId, { requiredTools: [TIME_TRACKER] });

    expect(unchanged).toMatchObject({ status: 200, body: { version: 1 } });
    expect(unversioned).toMatchObject({ status: 409, body: { code: "edit_conflict" } });
    expect(storedColumns(templateId).required_tools).toBe(JSON.stringify(THE_TOOLS));
  });

  it("lets only someone who may edit the Template change its tools", async () => {
    const templateId = await createTemplateAs("alice", { title: "Organization", requiredTools: THE_TOOLS, teamId: "org-1" });

    const byARunner = await saveTemplateAs("bob", templateId, { requiredTools: [], expected_version: 1 });

    expect(byARunner.status).toBe(403);
    expect(storedColumns(templateId).required_tools).toBe(JSON.stringify(THE_TOOLS));
  });

  it("copies the tools with a public Template into Personal and into an Organization", async () => {
    const sourceId = await createTemplateAs("alice", { title: "Shared playbook", requiredTools: THE_TOOLS, is_public: true });

    for (const destination of [{}, { teamId: "org-1" }]) {
      const response = await templatesApi(destination.teamId ? "alice" : "carol", "POST", `/${sourceId}/clone`, destination);
      expect(response.status).toBe(200);
      const { id } = await readJson(response, copied);
      expect(storedColumns(id).required_tools).toBe(JSON.stringify(THE_TOOLS));
    }
  });

  it("keeps the tools when a Template is deleted and restored, or transferred to an Organization", async () => {
    const templateId = await createTemplateAs("alice", { title: "Moves around", requiredTools: THE_TOOLS });

    expect((await templatesApi("alice", "DELETE", `/${templateId}`)).status).toBe(200);
    expect((await templatesApi("alice", "POST", `/${templateId}/restore`)).status).toBe(200);
    const { version } = storedColumns(templateId);
    expect((await templatesApi("alice", "POST", `/${templateId}/transfer`, { teamId: "org-1", expected_version: version })).status).toBe(200);

    expect(await toolsRead("alice", `/${templateId}`)).toEqual(THE_TOOLS);
    expect(snapshotTools(templateId, storedColumns(templateId).version)).toBe(JSON.stringify(THE_TOOLS));
  });

  it("reads a stored list with an entry it cannot read without failing the Template", async () => {
    const templateId = await createTemplateAs("alice", { title: "Hand edited" });
    d1.run(
      "UPDATE templates SET required_tools = ?, updated_at = ? WHERE id = ?",
      JSON.stringify([{ name: "", url: "https://example.com" }, TIME_TRACKER]),
      TOOLS_SEEDED_AT,
      templateId,
    );

    expect(await toolsRead("alice", `/${templateId}`)).toEqual([TIME_TRACKER]);
  });
});
