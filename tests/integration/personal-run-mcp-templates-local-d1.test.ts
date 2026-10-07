import { afterAll, beforeAll, describe, expect, it, onTestFinished } from "vitest";
import { elementAt, firstOf, onlyElement, present } from "../support/elements";
import {
  bodyOf,
  byteLength,
  callTool,
  env,
  keyId,
  mcpRequest,
  notesWithinUtf16Units,
  rows,
  sectionsAbout1KbUnderTheTemplateLimit,
  startLocalD1WithARunKeyForUserA,
  stopLocalD1,
  toolError,
  toolPayload,
  type JsonRecord,
} from "../support/personalRunMcpLocalD1";
import { handleAgentMcp } from "../../functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES } from "../../functions/api/handlers/agentMcpPages";
import { MAX_TASK_NOTES_LENGTH } from "../../functions/api/handlers/agentMcpTools";
import { RUN_KEY_REQUESTS_PER_MINUTE } from "../../functions/api/utils/mcp-limits";
import { createPersonalRunKeySecret } from "../../functions/api/utils/personal-run-key";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES, TEMPLATE_CONTENT_MAX_BYTES } from "../../src/lib/schemas/contentLimits";
import { readRunInFull } from "../support/runPages";
import { readTemplateInFull } from "../support/templatePages";
import { objectContaining } from "../support/asymmetricMatchers";
import { numberIn, optionalRecordIn, recordIn, recordsIn, textIn, type McpRecord } from "../support/mcpResponses";
import { jsonRecordIn, jsonRecordsIn, storedSections, storedSectionsIn } from "../support/storedJson";

describe.sequential("Personal Run Key MCP against real local D1", () => {
  beforeAll(startLocalD1WithARunKeyForUserA, 60_000);
  afterAll(stopLocalD1);

  it("creates no run when start_run rejects a template stored before the 768KB limit with more than a run's 896KB", async () => {
    const about930KbOfDescriptionsThatANewRunCopies = Array.from({ length: 93 }, (_, index) => ({
      id: `large-task-${index}`,
      title: `Large task ${index}`,
      isCompleted: false,
      description: "x".repeat(10_000),
    }));
    const items = [{ id: "section-large", title: "Large", items: about930KbOfDescriptionsThatANewRunCopies }];
    await env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES ('template-large', 'user-a', 'Large SOP', ?, 0, ?, 1, 'checklist', 'user', NULL, 'user-a', 1)
    `).bind(JSON.stringify(items), "2026-09-19T02:30:00.000Z").run();
    const countRuns = async () => onlyElement(await rows<{ count: number }>(
      "SELECT count(*) AS count FROM checklist_runs WHERE user_id = 'user-a'",
    )).count;
    const before = await countRuns();

    const errors: Array<string | undefined> = [];
    for (const id of [51, 52]) {
      errors.push(toolError(await bodyOf(await callTool("start_run", { templateId: "template-large" }, id))));
    }

    expect(await countRuns()).toBe(before);
    expect(errors).toEqual(["content_too_large", "content_too_large"]);
  });

  it("lists a never-edited template ahead of older edits, and the rest a page at a time", async () => {
    const insertTemplate = (id: string, createdAt: string, updatedAt: string | null) => env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, updated_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES (?, 'user-a', ?, '[]', 0, ?, ?, 1, 'checklist', 'user', NULL, 'user-a', 1)
    `).bind(id, `SOP ${id}`, createdAt, updatedAt);
    await env.DB.batch(Array.from({ length: 101 }, (_, index) => {
      const suffix = String(index).padStart(3, "0");
      return insertTemplate(`edited-${suffix}`, "2024-01-01T00:00:00.000Z", `2025-01-01T00:00:00.${suffix}Z`);
    }));
    const importedInOneRequestAndNeverEdited = [
      insertTemplate("imported-a", "2026-09-20T00:00:00.000Z", null),
      insertTemplate("imported-b", "2026-09-20T00:00:00.000Z", null),
    ];
    await env.DB.batch(importedInOneRequestAndNeverEdited);

    const payload = toolPayload(await bodyOf(await callTool("list_templates", {}, 71)));
    const ids = recordsIn(payload.templates).map(({ id }) => id);

    expect(ids.slice(0, 2)).toEqual(["imported-b", "imported-a"]);
    expect(ids).toContain("template-a");
    expect(ids).toHaveLength(100);
    expect(byteLength(payload)).toBeLessThanOrEqual(MAX_RESULT_BYTES);

    const nextPageWithTheOldestEdits = toolPayload(await bodyOf(await callTool("list_templates", { cursor: payload.nextCursor }, 72)));
    expect(recordsIn(nextPageWithTheOldestEdits.templates).map(({ id }) => id))
      .toEqual(["edited-004", "edited-003", "edited-002", "edited-001", "edited-000"]);
    expect(nextPageWithTheOldestEdits).not.toHaveProperty("nextCursor");
  });

  it("creates and edits a private personal template and syncs its in-progress runs, whose Changelog names the Run Key", async () => {
    const sections = [{
      title: "Boot",
      items: [{
        title: "Install",
        contents: [{ type: "subItems", subItems: [{ title: "pnpm install" }] }],
      }],
    }];

    const denied = await bodyOf(await callTool("create_template", { title: "Agent Harness Setup", sections }));
    expect(toolError(denied)).toBe("permission_denied");
    expect(await rows("SELECT id FROM templates WHERE title = 'Agent Harness Setup'")).toEqual([]);

    await env.DB.prepare("UPDATE personal_run_keys SET permissions = ? WHERE id = ?")
      .bind('["templates:read","templates:write","runs:read","runs:write"]', keyId)
      .run();

    const limited = await bodyOf(await callTool("create_template", { title: "Agent Harness Setup", sections }));
    expect(toolError(limited)).toBe("limit_reached");

    await env.DB.prepare(`
      INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-a', 'pro', ?)
    `).bind("2026-09-19T02:30:00.000Z").run();

    const createBody = await bodyOf(await callTool("create_template", {
      title: "Agent Harness Setup",
      description: "Per-project harness checklist",
      sections,
      tags: ["harness"],
    }));
    const created = recordIn(toolPayload(createBody).template);
    expect(created).toMatchObject({ title: "Agent Harness Setup", version: 1, tags: ["harness"] });
    const templateId = textIn(created.id);
    const [storedTemplate] = await rows(
      "SELECT user_id, owner_type, team_id, is_public FROM templates WHERE id = ?",
      templateId,
    );
    expect(storedTemplate).toEqual({ user_id: "user-a", owner_type: "user", team_id: null, is_public: 0 });

    const createdSection = firstOf(recordsIn(created.sections));
    const createdTask = firstOf(recordsIn(createdSection.items));
    expect(typeof createdSection.id).toBe("string");
    expect(typeof createdTask.id).toBe("string");

    const startBody = await bodyOf(await callTool("start_run", { templateId }));
    const templateRunId = textIn(recordIn(toolPayload(startBody).run).id);
    await callTool("update_run", {
      runId: templateRunId,
      expectedRevision: 1,
      operation: "set_task_completed",
      taskId: textIn(createdTask.id),
      completed: true,
    });

    const updateBody = await bodyOf(await callTool("update_template", {
      templateId,
      expectedVersion: 1,
      sections: [{ ...createdSection, items: [createdTask, { title: "Verify" }] }],
    }));
    const updated = recordIn(toolPayload(updateBody).template);
    expect(updated.version).toBe(2);
    expect(recordsIn(firstOf(recordsIn(updated.sections)).items).map(({ title }) => title))
      .toEqual(["Install", "Verify"]);

    const runBody = await bodyOf(await callTool("get_run", { runId: templateRunId }));
    const runTasks = recordsIn(firstOf(recordsIn(recordIn(toolPayload(runBody).run).sections)).items);
    expect(runTasks.map(({ title, isCompleted }) => ({ title, isCompleted: isCompleted === true }))).toEqual([
      { title: "Install", isCompleted: true },
      { title: "Verify", isCompleted: false },
    ]);

    const stale = await bodyOf(await callTool("update_template", { templateId, expectedVersion: 1, title: "Stale" }));
    expect(toolError(stale)).toBe("edit_conflict");

    const history = await rows(
      "SELECT action, actor_user_id, metadata_json FROM audit_events WHERE resource_type = 'template' AND resource_id = ? ORDER BY created_at",
      templateId,
    );
    expect(history.map(({ action }) => action)).toEqual(["template.created", "template.updated"]);
    expect(history.every((event) => event.actor_user_id === "user-a")).toBe(true);
    expect(history.every((event) => String(event.metadata_json).includes(`"personalRunKeyId":"${keyId}"`))).toBe(true);

    const reconciledEventsInTheRunsChangelog = await rows(
      "SELECT metadata_json FROM audit_events WHERE resource_type = 'checklist_run' AND resource_id = ? AND action = 'checklist_run.reconciled'",
      templateRunId,
    );
    expect(String(onlyElement(reconciledEventsInTheRunsChangelog).metadata_json)).toContain(`"personalRunKeyId":"${keyId}"`);
  });

  it("keeps template writes inside the key owner's private personal templates", async () => {
    const sections = [{ title: "Section", items: [{ title: "Task" }] }];
    await env.DB.batch([
      env.DB.prepare(`
        INSERT INTO team_members (id, team_id, user_id, role, status, joined_at, created_at)
        VALUES ('member-a', 'team-a', 'user-a', 'owner', 'active', ?, ?)
      `).bind("2026-09-19T02:40:00.000Z", "2026-09-19T02:40:00.000Z"),
      env.DB.prepare(`
        INSERT INTO templates (
          id, user_id, title, items, is_public, created_at, version, type, owner_type,
          team_id, created_by_user_id, content_version
        ) VALUES ('template-public', 'user-a', 'Published SOP', ?, 1, ?, 1, 'checklist', 'user', NULL, 'user-a', 1)
      `).bind(JSON.stringify(sections), "2026-09-19T02:40:00.000Z"),
    ]);

    const publicRead = await bodyOf(await callTool("get_template", { templateId: "template-public" }));
    expect(recordIn(toolPayload(publicRead).template).title).toBe("Published SOP");
    const publicWrite = await bodyOf(await callTool("update_template", {
      templateId: "template-public",
      expectedVersion: 1,
      title: "Defaced public SOP",
    }));
    expect(toolError(publicWrite)).toBe("template_is_public");

    const viaQuery = await bodyOf(await handleAgentMcp(mcpRequest("tools/call", {
      name: "create_template",
      arguments: { title: "Created with teamId query", sections },
    }, 1, "/api/mcp?teamId=team-a"), env));
    const viaQueryId = recordIn(toolPayload(viaQuery).template).id;
    expect(await rows("SELECT owner_type, team_id, is_public FROM templates WHERE id = ?", viaQueryId)).toEqual([
      { owner_type: "user", team_id: null, is_public: 0 },
    ]);

    for (const templateId of ["template-b", "template-team"]) {
      const read = await bodyOf(await callTool("get_template", { templateId }));
      expect(toolError(read)).toBe("template_not_found");
      const write = await bodyOf(await callTool("update_template", { templateId, expectedVersion: 1, title: "Taken" }));
      expect(toolError(write)).toBe("template_not_found");
    }

    for (const extra of [{ is_public: true }, { teamId: "team-a" }, { visibility: "public" }]) {
      const body = await bodyOf(await callTool("create_template", { title: "Escalation", sections, ...extra }));
      expect(recordIn(recordIn(body.error).data).code).toBe("invalid_arguments");
    }

    expect(await rows(
      "SELECT title FROM templates WHERE id IN ('template-b', 'template-public', 'template-team') ORDER BY id",
    )).toEqual([
      { title: "Other user's SOP" },
      { title: "Published SOP" },
      { title: "Team SOP" },
    ]);
    expect(await rows("SELECT id FROM templates WHERE title = 'Escalation'")).toEqual([]);
  });

  it("reports a committed oversized create as success without its sections", async () => {
    const body = await bodyOf(await callTool("create_template", {
      title: "Oversized SOP",
      sections: [{ title: "Long", items: [{ title: "Read", contents: [{ type: "text", value: "x".repeat(300_000) }] }] }],
    }));
    expect(toolError(body)).toBeUndefined();
    expect(toolPayload(body).sectionsOmitted).toBe(true);
    expect(toolPayload(body).template).not.toHaveProperty("sections");
    expect(await rows("SELECT id FROM templates WHERE title = 'Oversized SOP'")).toHaveLength(1);
  });

  it("reads a template near the 768KB limit back in full and edits it a part at a time", async () => {
    const sections = sectionsAbout1KbUnderTheTemplateLimit();
    expect(contentSaveBytes(sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
    expect(contentSaveBytes(sections)).toBeGreaterThan(TEMPLATE_CONTENT_MAX_BYTES - 16 * 1024);

    const created = toolPayload(await bodyOf(await callTool("create_template", {
      title: "Operations Handbook",
      description: "Everything the on-call team checks",
      sections,
    })));
    expect(created.sectionsOmitted).toBe(true);
    const templateId = textIn(recordIn(created.template).id);

    const resultBytes: number[] = [];
    const readTool = async (args: JsonRecord) => {
      const body = await bodyOf(await callTool("get_template", args));
      const result = recordIn(body.result);
      expect(result.isError).toBeUndefined();
      resultBytes.push(new TextEncoder().encode(JSON.stringify(result.structuredContent)).byteLength);
      return recordIn(result.structuredContent);
    };

    const { template, results } = await readTemplateInFull(readTool, templateId);
    expect(template).toMatchObject({ id: templateId, title: "Operations Handbook", version: 1 });
    expect(template.sections).toEqual(sections);
    expect(Math.max(...resultBytes)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(results.length).toBeLessThan(RUN_KEY_REQUESTS_PER_MINUTE / 3);
    expect(results.some((result) => optionalRecordIn(result.part)?.of === "task")).toBe(true);
    expect(results.some((result) => typeof optionalRecordIn(result.section)?.firstTask === "number")).toBe(true);
    const guideCursor = textIn((await readTool({ templateId, sectionId: "guide" })).nextCursor);
    expect(typeof guideCursor).toBe("string");

    const update = async (args: JsonRecord) => toolPayload(await bodyOf(await callTool("update_template", { templateId, ...args })));

    const replaced = await update({ expectedVersion: 1, operation: "replace_task", taskId: "check-7", task: { title: "Check the pager" } });
    expect(replaced).toMatchObject({ sectionsOmitted: true, sectionId: "checks", taskId: "check-7", task: { title: "Check the pager" } });
    expect(replaced.template).toMatchObject({ version: 2 });

    const inserted = await update({
      expectedVersion: 2,
      operation: "insert_task",
      beforeTaskId: "guide-long",
      task: { title: "Read the summary first" },
    });
    const insertedId = textIn(inserted.taskId);
    expect(insertedId).toMatch(/^item_/);
    expect(inserted.task).toEqual({ id: insertedId, title: "Read the summary first" });

    const moved = await update({ expectedVersion: 3, operation: "move_section", sectionId: "guide" });
    expect(moved.template).toMatchObject({ version: 4 });
    const removed = await update({ expectedVersion: 4, operation: "remove_task", taskId: "area-0-3" });
    expect(removed.template).toMatchObject({ version: 5 });

    const stale = await bodyOf(await callTool("update_template", {
      templateId,
      expectedVersion: 4,
      operation: "remove_task",
      taskId: "area-0-4",
    }));
    expect(toolError(stale)).toBe("edit_conflict");
    const staleRead = await bodyOf(await callTool("get_template", { templateId, cursor: guideCursor }));
    expect(toolError(staleRead)).toBe("edit_conflict");

    const templateWithOnlyThoseFourChanges = storedSections.parse(structuredClone(sections));
    const checks = elementAt(templateWithOnlyThoseFourChanges, 1).items;
    checks[7] = { ...elementAt(checks, 7), title: "Check the pager" };
    firstOf(templateWithOnlyThoseFourChanges).items.splice(1, 0, { id: insertedId, title: "Read the summary first" });
    templateWithOnlyThoseFourChanges.push(present(templateWithOnlyThoseFourChanges.shift(), "the guide section"));
    elementAt(templateWithOnlyThoseFourChanges, 1).items.splice(3, 1);
    const stored = onlyElement(await rows("SELECT items, version FROM templates WHERE id = ?", templateId));
    expect(stored.version).toBe(5);
    expect(storedSectionsIn(stored.items)).toEqual(templateWithOnlyThoseFourChanges);

    const outline = await readTool({ templateId });
    expect(recordsIn(outline.outline).map(({ id }) => id).at(-1)).toBe("guide");
    expect(await readTool({ templateId, taskId: insertedId })).toMatchObject({ sectionId: "guide", task: { id: insertedId } });

    const history = await rows(
      "SELECT metadata_json FROM audit_events WHERE resource_type = 'template' AND resource_id = ? AND action = 'template.updated' ORDER BY created_at",
      templateId,
    );
    expect(history.map(({ metadata_json }) => jsonRecordIn(metadata_json)["operation"]))
      .toEqual(["replace_task", "insert_task", "move_section", "remove_task"]);
  }, 60_000);

  it("reads a run near the 896KB limit back in full, a bounded result at a time, and updates it", async () => {
    const runKeyOfItsOwnForTheLongRead = await createPersonalRunKeySecret();
    await env.DB.prepare(`
      INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at, permissions)
      VALUES ('key-user-a-runs', 'user-a', 'Run reader', ?, ?, ?, ?)
    `).bind(
      runKeyOfItsOwnForTheLongRead.keyPrefix,
      runKeyOfItsOwnForTheLongRead.keyHash,
      "2026-09-19T02:50:00.000Z",
      '["templates:read","templates:write","runs:read","runs:write"]',
    ).run();
    const removeItForTheKeyCountChecksThatExpectOnlyTheFirstKey = async () => {
      await env.DB.prepare("DELETE FROM personal_run_keys WHERE id = 'key-user-a-runs'").run();
    };
    onTestFinished(removeItForTheKeyCountChecksThatExpectOnlyTheFirstKey);
    let calls = 0;
    const call = async (name: string, args: JsonRecord): Promise<McpRecord> => {
      calls += 1;
      const body = await bodyOf(await handleAgentMcp(
        mcpRequest("tools/call", { name, arguments: args }, calls, "/api/mcp", runKeyOfItsOwnForTheLongRead.key),
        env,
      ));
      expect(body.error, `${name}: ${JSON.stringify(body.error)}`).toBeUndefined();
      const payload = toolPayload(body);
      expect(byteLength(payload), name).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      return payload;
    };
    const tool = async (name: string, args: JsonRecord): Promise<McpRecord> => {
      const payload = await call(name, args);
      expect(payload.error, `${name}: ${String(payload.message)}`).toBeUndefined();
      return payload;
    };

    const created = await tool("create_template", { title: "Incident Runbook", sections: sectionsAbout1KbUnderTheTemplateLimit() });
    const templateId = textIn(recordIn(created.template).id);
    const started = await tool("start_run", { templateId, title: "Incident drill" });
    expect(started).toMatchObject({ run: { title: "Incident drill", revision: 1 }, sectionsOmitted: true });
    const runId = textIn(recordIn(started.run).id);
    let revision = 1;
    const update = async (args: JsonRecord) => {
      const result = await tool("update_run", { runId, expectedRevision: revision, ...args });
      revision = numberIn(recordIn(result.run).revision);
      return result;
    };
    const storedRun = async () => onlyElement(await rows(
      "SELECT items, retired_items, revision FROM checklist_runs WHERE id = ?",
      runId,
    ));

    await update({ operation: "set_task_notes", taskId: "area-0-0", notes: notesWithinUtf16Units(MAX_TASK_NOTES_LENGTH) });
    await update({ operation: "set_task_notes", taskId: "check-5", notes: "Pager rotated before the drill." });
    const removalsOfTheNotedSectionAndTaskTheRunKeepsAsRetiredWork = [
      { operation: "remove_section", sectionId: "area-0" },
      { operation: "remove_task", taskId: "check-5" },
    ];
    let version = 1;
    for (const operation of removalsOfTheNotedSectionAndTaskTheRunKeepsAsRetiredWork) {
      version = numberIn(recordIn((await tool("update_template", { templateId, expectedVersion: version, ...operation })).template).version);
    }
    revision = Number((await storedRun()).revision);
    expect(revision).toBe(5);

    for (let area = 1; ; area += 1) {
      const roomLeftAbove1KbUnderTheRunLimit = RUN_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(storedSectionsIn((await storedRun()).items));
      if (roomLeftAbove1KbUnderTheRunLimit < 1_000) break;
      const notes = notesWithinUtf16Units(Math.min(MAX_TASK_NOTES_LENGTH, Math.floor(roomLeftAbove1KbUnderTheRunLimit / 1.1)));
      await update({ operation: "set_task_notes", taskId: `area-${area}-0`, notes });
    }
    const stored = await storedRun();
    const storedRunSections = storedSectionsIn(stored.items);
    const storedRetired = jsonRecordsIn(stored.retired_items);
    expect(contentSaveBytes(storedRunSections)).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
    expect(contentSaveBytes(storedRunSections)).toBeGreaterThan(RUN_CONTENT_MAX_BYTES - 4 * 1024);
    expect(storedRetired.map(({ kind }) => kind)).toEqual(["section", "item"]);

    const before = calls;
    const { run, results } = await readRunInFull((args) => tool("get_run", args), runId);
    expect(run).toMatchObject({ id: runId, title: "Incident drill", revision, templateVersion: 3 });
    expect(run.sections).toEqual(storedRunSections);
    expect(run.retiredItems).toEqual(storedRetired);
    const parts = new Set(results.flatMap((result) => (result.part ? [recordIn(result.part).of] : [])));
    expect(parts).toEqual(new Set(["task", "retiredItem"]));
    expect(results.some((result) => typeof optionalRecordIn(result.section)?.firstTask === "number")).toBe(true);
    expect(calls - before).toBe(results.length);
    expect(results.length).toBeLessThan(80);
    const staleCursor = results.find((result) => typeof result.nextCursor === "string")?.nextCursor;
    expect(typeof staleCursor).toBe("string");

    const ticked = await update({ operation: "set_task_completed", taskId: "check-100", completed: true });
    expect(ticked).toMatchObject({ sectionId: "checks", taskId: "check-100", task: { id: "check-100", isCompleted: true } });
    const noted = await update({ operation: "set_task_notes", taskId: "guide-long", notes: "Read the summary first." });
    expect(noted).toEqual({ run: objectContaining({ id: runId, revision }), sectionId: "guide", taskId: "guide-long", taskOmitted: true });
    expect(await call("get_run", { runId, cursor: staleCursor })).toMatchObject({
      error: "edit_conflict",
      details: { currentRevision: revision },
    });

    const after = storedSectionsIn((await storedRun()).items);
    const task = (sectionIndex: number, taskId: string) => elementAt(after, sectionIndex).items.find(({ id }) => id === taskId);
    expect(task(1, "check-100")).toMatchObject({ isCompleted: true });
    expect(task(0, "guide-long")).toMatchObject({ notes: "Read the summary first." });
    expect(await call("get_run", { runId, taskId: "check-100" })).toMatchObject({ sectionId: "checks", task: { isCompleted: true } });
  }, 120_000);
});
