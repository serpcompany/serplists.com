import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { insertOwnedRun, openRunOwnerDatabase, storedValue } from "../../../support/runOwnerOnSqlite";
import { callToolWithAFreshRunKey } from "../../../support/agentMcpOnSqlite";
import { recordIn, recordsIn } from "../../../support/mcpResponses";
import { jsonRecordIn } from "../../../support/storedJson";
import { MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

async function toolResult(name: string, args: Record<string, unknown>) {
  const { result } = await callToolWithAFreshRunKey(database, name, args);
  expect(result.isError).toBeUndefined();
  return result.structuredContent;
}

const sectionsOf = (record: unknown) => recordsIn(recordIn(record).sections);

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
});

afterEach(() => {
  database.sqlite.close();
});

describe("MCP reads of content stored before the API checked every write", () => {
  it("reads a Template whose stored content cannot be read as one with no sections, and starts an empty run from it", async () => {
    database.run("UPDATE templates SET items = 'not json' WHERE id = 'template-1'");

    expect(sectionsOf((await toolResult("get_template", { templateId: "template-1" })).template)).toEqual([]);
    expect(sectionsOf((await toolResult("start_run", { templateId: "template-1" })).run)).toEqual([]);
  });

  it("reads a Template section stored with no task list as one with no tasks", async () => {
    database.run("UPDATE templates SET items = ? WHERE id = 'template-1'", JSON.stringify([
      { id: "s1", title: "Packing", items: [{ id: "t1", title: "Tent" }] },
      { id: "s2", title: "Notes" },
    ]));

    const sections = sectionsOf((await toolResult("get_template", { templateId: "template-1" })).template);

    expect(sections.map(({ id, items }) => ({ id, tasks: recordsIn(items).length }))).toEqual([{ id: "s1", tasks: 1 }, { id: "s2", tasks: 0 }]);
  });

  it("reads a run whose stored content cannot be read as one with no sections, and a status and progress never stored as in progress at 0", async () => {
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "not json" });
    database.run("UPDATE checklist_runs SET status = NULL, progress = NULL WHERE id = 'run-1'");

    const run = recordIn((await toolResult("get_run", { runId: "run-1" })).run);

    expect(run).toMatchObject({ id: "run-1", status: "in_progress", progress: 0 });
    expect(sectionsOf(run)).toEqual([]);
  });

  it("reads retired work stored with content that is not a block, a section with no task list, and a task that is not an object", async () => {
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "[]" });
    database.run("UPDATE checklist_runs SET retired_items = ? WHERE id = 'run-1'", JSON.stringify([
      { kind: "item", sectionId: "s1", item: { id: "old", title: "Old", contents: ["a note stored as text", { type: "text", value: "Kept" }] } },
      { kind: "section", section: { id: "gone", title: "Gone" } },
      { kind: "section", section: { id: "gone-2", title: "Gone too", items: ["not a task", { id: "t9", title: "Task" }] } },
    ]));

    const { retiredItems } = await toolResult("get_run", { runId: "run-1", retired: true });

    expect(retiredItems).toEqual([
      { kind: "item", sectionId: "s1", item: { id: "old", title: "Old", contents: ["a note stored as text", { type: "text", value: "Kept" }] } },
      { kind: "section", section: { id: "gone", title: "Gone", items: [] } },
      { kind: "section", section: { id: "gone-2", title: "Gone too", items: ["not a task", { id: "t9", title: "Task" }] } },
    ]);
  });

  it("sets the status of a run whose progress was never stored, keeping it at 0 and auditing the change from 0", async () => {
    insertOwnedRun(database, { id: "run-1", status: "completed", items: "[]" });
    database.run("UPDATE checklist_runs SET progress = NULL WHERE id = 'run-1'");

    const { run } = await toolResult("update_run", { runId: "run-1", expectedRevision: 1, operation: "set_run_status", status: "in_progress" });

    expect(recordIn(run)).toMatchObject({ status: "in_progress", progress: 0, revision: 2 });
    expect(storedValue(database, "SELECT progress AS value FROM checklist_runs WHERE id = ?", "run-1")).toBe(0);
    const diff = jsonRecordIn(storedValue(database, "SELECT diff_json AS value FROM audit_events WHERE action = ?", "checklist_run.updated"));
    expect(diff["progress"]).toEqual({ from: 0, to: 0 });
  });

  it("refuses a list whose first Template alone is too large for one result with result_too_large", async () => {
    database.run("UPDATE templates SET type = ? WHERE id = 'template-1'", "x".repeat(MAX_RESULT_BYTES));

    const { result } = await callToolWithAFreshRunKey(database, "list_templates", {});

    expect(result.isError).toBe(true);
    expect(result.structuredContent).toEqual({
      error: "result_too_large",
      message: "Result is too large to return",
      details: { limit: MAX_RESULT_BYTES },
    });
  });
});
