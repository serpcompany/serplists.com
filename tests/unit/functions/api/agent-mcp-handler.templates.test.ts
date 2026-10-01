import type { SQL } from "drizzle-orm";
import { SQLiteSyncDialect } from "drizzle-orm/sqlite-core";
import { DatabaseSync } from "node:sqlite";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";
import {
  dbMocks,
  env,
  NO_TEMPLATE_HOLDS_THE_SLUG,
  ownedTemplate,
  personalRun,
  resetAgentMcpHandlerMocks,
  toolBody,
  type JsonRecord,
} from "../../../support/agentMcpHandler";
import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { RUN_SECTIONS_WITH_LEGACY_IDS, TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS } from "../../../fixtures/runStartFixtures";
import { mcpArgumentsError, mcpTemplatesPage, mcpToolCall, runKeyWithEveryPermission } from "../../../support/agentMcp";
import { readJson } from "../../../support/readJson";

describe("personal run MCP handler", () => {
  beforeEach(resetAgentMcpHandlerMocks);

  it("lists never-edited templates by when they were created, not after every edited one", async () => {
    await handleAgentMcp(mcpToolCall("list_templates"), env);
    const orderBy = dbMocks.selectChain.orderBy.mock.calls[0].map((part: unknown) =>
      new SQLiteSyncDialect().sqlToQuery(part as SQL));

    const realSqlite = new DatabaseSync(":memory:");
    realSqlite.exec('create table "templates" ("id" text, "created_at" text, "updated_at" text)');
    const insert = realSqlite.prepare('insert into "templates" values (?, ?, ?)');
    insert.run("edited-long-ago", "2024-01-01T00:00:00.000Z", "2024-02-01T00:00:00.000Z");
    insert.run("edited-recently", "2024-01-01T00:00:00.000Z", "2026-09-01T00:00:00.000Z");
    insert.run("created-today", "2026-09-20T00:00:00.000Z", null);
    insert.run("imported-a", "2025-05-05T00:00:00.000Z", null);
    insert.run("imported-b", "2025-05-05T00:00:00.000Z", null);
    const ordered = realSqlite
      .prepare(`select "id" from "templates" order by ${orderBy.map((part: { sql: string }) => part.sql).join(", ")}`)
      .all(...orderBy.flatMap((part: { params: unknown[] }) => part.params as string[]))
      .map((row) => row.id);
    realSqlite.close();

    expect(ordered).toEqual(["created-today", "edited-recently", "imported-b", "imported-a", "edited-long-ago"]);
  });

  it("does not expose another user's or a team's templates", async () => {
    dbMocks.selectChain.limit.mockResolvedValueOnce([
      {
        id: "owned",
        user_id: "user-1",
        owner_type: "user",
        team_id: null,
        deleted_at: null,
        title: "Owned",
        items: "[]",
      },
      {
        id: "other",
        user_id: "user-2",
        owner_type: "user",
        team_id: null,
        deleted_at: null,
        title: "Other",
        items: "[]",
      },
      {
        id: "team",
        user_id: "user-1",
        owner_type: "team",
        team_id: "team-1",
        deleted_at: null,
        title: "Team",
        items: "[]",
      },
    ]);

    const body = await toolBody(await handleAgentMcp(mcpToolCall("list_templates"), env));
    const { templates } = mcpTemplatesPage.parse(body.result.structuredContent);

    expect(templates.map((template) => template.id)).toEqual(["owned"]);
    expect(templates[0]).not.toHaveProperty("sections");
    expect(body.result.content[0].text).toContain('"id":"owned"');
    expect(markPersonalRunKeyUsed).toHaveBeenCalledWith(env, runKeyWithEveryPermission);
  });

  describe("template tools", () => {
    const sectionIds = z.array(z.object({ id: z.string(), items: z.array(z.object({ id: z.string() }).passthrough()) }).passthrough());
    const ids = (sections: unknown) => sectionIds.parse(sections).map((section) => [section.id, section.items.map((item) => item.id)]);
    const templateSections = z.object({ template: z.object({ sections: z.unknown() }).passthrough() }).passthrough();

    it("reads a template stored without ids with the ids its runs and next save use, so sending them back keeps the runs' progress", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([ownedTemplate(TEMPLATE_SECTIONS_WITHOUT_ACCEPTED_IDS)]);
      const read = await toolBody(await handleAgentMcp(mcpToolCall("get_template", { templateId: "template-1" }), env));

      expect(read.result.isError).toBeUndefined();
      expect(ids(templateSections.parse(read.result.structuredContent).template.sections)).toEqual(ids(RUN_SECTIONS_WITH_LEGACY_IDS));
    });

    it("treats null optional fields as absent, as every other tool does", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce(NO_TEMPLATE_HOLDS_THE_SLUG)
        .mockResolvedValueOnce([{ ...ownedTemplate(JSON.parse(personalRun().items as string)), version: 1 }]);

      const body = await toolBody(await handleAgentMcp(mcpToolCall("create_template", {
        title: "Release SOP",
        description: null,
        categories: null,
        tags: null,
        sections: [{ title: "Release", items: [{ title: "Verify" }] }],
      }), env));

      expect(body.result.isError).toBeUndefined();
      expect(body.result.structuredContent.template).toEqual(expect.objectContaining({ id: "template-1", version: 1 }));
      const created = dbMocks.insertChain.values.mock.calls.map(([values]) => values)
        .find((values: JsonRecord) => values.owner_type === "user" && typeof values.slug === "string");
      expect(created).toEqual(expect.objectContaining({ is_public: false, team_id: null, user_id: "user-1" }));
    });

    it("names the offending field when template arguments are invalid", async () => {
      const body = await readJson(await handleAgentMcp(mcpToolCall("update_template", {
        templateId: "template-1",
        expectedVersion: 1,
        title: "",
      }), env), mcpArgumentsError);

      expect(body.error.data.code).toBe("invalid_arguments");
      expect(body.error.message).toMatch(/^title: /);
      expect(dbMocks.db.batch).not.toHaveBeenCalled();
    });

    it("reports a committed create as success when reading it back fails, since a retried create would make a duplicate", async () => {
      const warn = vi.spyOn(console, "warn").mockImplementation(() => {});
      try {
        dbMocks.selectChain.limit
          .mockResolvedValueOnce(NO_TEMPLATE_HOLDS_THE_SLUG)
          .mockRejectedValueOnce(new Error("D1_ERROR: database is locked"));

        const body = await toolBody(await handleAgentMcp(mcpToolCall("create_template", {
          title: "Release SOP",
          sections: [{ title: "Release", items: [{ title: "Verify" }] }],
        }), env));

        expect(dbMocks.db.batch).toHaveBeenCalledOnce();
        expect(body.result.isError).toBeUndefined();
        expect(body.result.structuredContent).toEqual({
          template: { id: expect.any(String), title: "Release SOP", version: 1 },
          sectionsOmitted: true,
        });
        expect(warn.mock.calls.map(([line]) => JSON.parse(String(line)).message)).toContain("mcp_template_reload_error");
      } finally {
        warn.mockRestore();
      }
    });

    it("records the Run Key on the template's history", async () => {
      dbMocks.selectChain.limit
        .mockResolvedValueOnce(NO_TEMPLATE_HOLDS_THE_SLUG)
        .mockResolvedValueOnce([{ ...ownedTemplate([]), version: 1 }]);

      await handleAgentMcp(mcpToolCall("create_template", {
        title: "Release SOP",
        sections: [{ title: "Release", items: [{ title: "Verify" }] }],
      }), env);

      expect(dbMocks.insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
        action: "template.created",
        metadata_json: expect.stringContaining('"personalRunKeyName":"Codex"'),
      }));
    });
  });

  describe("strict JSON clients", () => {
    const LONE_SURROGATE_ESCAPE = /\\ud[89a-f][0-9a-f]{2}/i;

    const ownedTemplateRow = (overrides: JsonRecord) => ({
      id: "template-1",
      user_id: "user-1",
      owner_type: "user",
      team_id: null,
      deleted_at: null,
      title: "Launch SOP",
      description: null,
      items: "[]",
      ...overrides,
    });

    it("keeps list_templates parseable when a description is cut at an emoji", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        ownedTemplateRow({ description: `${"a".repeat(498)}\u{1F680}${"b".repeat(60)}` }),
      ]);

      const raw = await (await handleAgentMcp(mcpToolCall("list_templates"), env)).text();

      expect(raw).not.toMatch(LONE_SURROGATE_ESCAPE);
      const description = JSON.parse(raw).result.structuredContent.templates[0].description as string;
      expect(description.length).toBeLessThanOrEqual(500);
      expect(description.endsWith("…")).toBe(true);
    });

    it("keeps get_run parseable when a long run title is cut at an emoji", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        personalRun({ title: `${"R".repeat(158)}\u{1F680}${"x".repeat(40)}` }),
      ]);

      const raw = await (await handleAgentMcp(mcpToolCall("get_run", { runId: "run-1" }), env)).text();

      expect(raw).not.toMatch(LONE_SURROGATE_ESCAPE);
      expect(JSON.parse(raw).result.structuredContent.run.title).toBe(`${"R".repeat(158)}\u{1F680}${"x".repeat(40)}`);
    });

    it("replaces lone surrogates already stored in template text", async () => {
      dbMocks.selectChain.limit.mockResolvedValueOnce([
        ownedTemplateRow({ title: "Broken \uD83D title", description: "Half \uDE80 emoji" }),
      ]);

      const raw = await (await handleAgentMcp(mcpToolCall("list_templates"), env)).text();

      expect(raw).not.toMatch(LONE_SURROGATE_ESCAPE);
      const [template] = JSON.parse(raw).result.structuredContent.templates;
      expect(template.title).toBe("Broken � title");
      expect(template.description).toBe("Half � emoji");
    });
  });
});
