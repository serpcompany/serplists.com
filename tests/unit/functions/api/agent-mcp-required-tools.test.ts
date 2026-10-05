import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";

import {
  callToolWithAFreshRunKey,
  openAFreshMcpDatabase,
  refusedToolCallWithAFreshRunKey,
} from "../../../support/agentMcpOnSqlite";
import { onlyElement } from "../../../support/elements";
import type { SqliteD1 } from "../../../support/sqlite-d1";

const AGENT_TOOLS = [
  { name: "Time tracker", url: "https://example.com/track", required: true },
  { name: "Slideshow app", url: "https://example.com/slides", required: false },
];
const SOP_SECTIONS = [{ id: "s1", title: "Prepare", items: [{ id: "i1", title: "Open the tracker" }] }];
const SEEDED = "2026-10-05T00:00:00.000Z";

const templateWithTools = z.object({
  template: z.object({ id: z.string(), version: z.number(), requiredTools: z.unknown() }).passthrough(),
}).passthrough();

let d1: SqliteD1;

const storedTools = () =>
  onlyElement(d1.rows<{ required_tools: string | null }>("SELECT required_tools FROM templates WHERE id = 'sop'")).required_tools;

async function templateFrom(tool: string, args: Record<string, unknown>) {
  const { result } = await callToolWithAFreshRunKey(d1, tool, args);
  expect(result.isError, JSON.stringify(result.structuredContent)).toBeUndefined();
  return templateWithTools.parse(result.structuredContent).template;
}

async function refusedCode(tool: string, args: Record<string, unknown>) {
  const { error } = await refusedToolCallWithAFreshRunKey(d1, tool, args);
  return z.object({ code: z.string() }).passthrough().parse(error.data).code;
}

describe("a template's Required tools over the Run Key MCP: read by get_template, and never written or wiped by it", () => {
  beforeEach(() => {
    d1 = openAFreshMcpDatabase();
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'agent-owner@example.test', 'Owner', 1, ?)", SEEDED);
    d1.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', ?)", SEEDED);
    d1.run(
      `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, created_by_user_id,
        content_version, required_tools) VALUES ('sop', 'user-1', 'SOP', ?, 0, ?, 1, 'checklist', 'user', 'user-1', 1, ?)`,
      JSON.stringify(SOP_SECTIONS), SEEDED, JSON.stringify(AGENT_TOOLS),
    );
  });
  afterEach(() => d1.close());

  it("returns requiredTools with the template from get_template", async () => {
    expect((await templateFrom("get_template", { templateId: "sop" })).requiredTools).toEqual(AGENT_TOOLS);
  });

  it("keeps them through update_template, whether it replaces fields or runs an operation", async () => {
    const renamed = await templateFrom("update_template", { templateId: "sop", expectedVersion: 1, title: "SOP v2" });
    const edited = await templateFrom("update_template", {
      templateId: "sop",
      expectedVersion: renamed.version,
      operation: "replace_task",
      taskId: "i1",
      task: { title: "Start the timer" },
    });

    expect([renamed.requiredTools, edited.requiredTools]).toEqual([AGENT_TOOLS, AGENT_TOOLS]);
    expect(storedTools()).toBe(JSON.stringify(AGENT_TOOLS));
  });

  it("refuses requiredTools as an argument of update_template and create_template, so an agent cannot change or wipe them", async () => {
    expect(await refusedCode("update_template", { templateId: "sop", expectedVersion: 1, requiredTools: [] })).toBe("invalid_arguments");
    expect(await refusedCode("create_template", { title: "New", sections: SOP_SECTIONS, requiredTools: AGENT_TOOLS })).toBe("invalid_arguments");
    expect(storedTools()).toBe(JSON.stringify(AGENT_TOOLS));
  });

  it("creates a template with no tools", async () => {
    expect((await templateFrom("create_template", { title: "New", sections: SOP_SECTIONS })).requiredTools).toEqual([]);
  });
});
