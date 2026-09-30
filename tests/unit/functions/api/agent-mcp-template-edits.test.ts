import { describe, expect, it } from "vitest";

import { applyTemplateOperation } from "@functions/api/handlers/agentMcpTemplateEdits";
import { templateOperationArgs } from "@functions/api/handlers/agentMcpTemplateTools";
import { parseToolArguments, ToolError } from "@functions/api/handlers/agentMcpTools";

type JsonRecord = Record<string, unknown>;

const task = (id: string, extra: JsonRecord = {}) => ({
  id,
  title: `Task ${id}`,
  description: `About ${id}`,
  contents: [{ id: `${id}-c`, type: "subItems", value: "", subItems: [{ id: `${id}-sub`, title: "Check", isCompleted: false }] }],
  ...extra,
});

// Sections as get_template returns them, one with a key the app does not know.
const stored = (): JsonRecord[] => [
  { id: "s1", title: "Prepare", collapsed: true, items: [task("t1"), task("t2")] },
  { id: "s2", title: "Ship", items: [task("t3")] },
  { id: "s3", title: "Verify", items: [task("t4"), task("t5", { notes: "kept" })] },
];

// Arguments as update_template receives them, parsed as the tool parses them.
const apply = (args: JsonRecord, sections = stored()) =>
  applyTemplateOperation(sections, parseToolArguments(templateOperationArgs, { templateId: "tpl-1", expectedVersion: 4, ...args }));

const outline = (sections: JsonRecord[]) =>
  sections.map((section) => [section.id, (section.items as JsonRecord[]).map((item) => item.id)]);

function errorOf(action: () => unknown): ToolError {
  try {
    action();
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error("expected a ToolError");
}

const SECTION_ID = /^section_[0-9a-f-]{36}$/;
const ITEM_ID = /^item_[0-9a-f-]{36}$/;
const SUBITEM_ID = /^subitem_[0-9a-f-]{36}$/;

describe("update_template operations", () => {
  it("replace_section changes the fields it is given and keeps the rest", () => {
    const renamed = apply({ operation: "replace_section", sectionId: "s1", section: { title: "Get ready" } });
    expect(renamed.sections[0]).toEqual({ ...stored()[0], title: "Get ready" });
    expect(renamed.sectionId).toBe("s1");

    const replaced = apply({
      operation: "replace_section",
      sectionId: "s1",
      section: { id: "s1", items: [{ id: "t2", title: "Kept task" }, { title: "New task", contents: [{ type: "subItems", subItems: [{ title: "New check" }] }] }] },
    });
    const [kept, added] = replaced.sections[0].items as JsonRecord[];
    expect(replaced.sections[0]).toMatchObject({ id: "s1", title: "Prepare", collapsed: true });
    expect(kept).toEqual({ id: "t2", title: "Kept task" });
    expect(added.id).toMatch(ITEM_ID);
    expect(((added.contents as JsonRecord[])[0].subItems as JsonRecord[])[0].id).toMatch(SUBITEM_ID);
    expect(outline(replaced.sections).slice(1)).toEqual(outline(stored()).slice(1));
  });

  it("insert_section adds a section before another or at the end, with ids for what lacks one", () => {
    const atEnd = apply({ operation: "insert_section", section: { title: "Retro", items: [{ title: "Notes" }] } });
    const added = atEnd.sections[3];
    expect(added.id).toMatch(SECTION_ID);
    expect((added.items as JsonRecord[])[0].id).toMatch(ITEM_ID);
    expect(atEnd.sectionId).toBe(added.id);

    const before = apply({
      operation: "insert_section",
      section: { id: "s0", title: "Plan", items: [{ id: "t0", title: "Scope" }] },
      beforeSectionId: "s2",
    });
    expect(outline(before.sections).map(([id]) => id)).toEqual(["s1", "s0", "s2", "s3"]);
    expect(before.sectionId).toBe("s0");
  });

  it("move_section moves a section before another or to the end, and before itself leaves it", () => {
    expect(apply({ operation: "move_section", sectionId: "s3", beforeSectionId: "s1" }).sections.map(({ id }) => id))
      .toEqual(["s3", "s1", "s2"]);
    expect(apply({ operation: "move_section", sectionId: "s1" }).sections.map(({ id }) => id)).toEqual(["s2", "s3", "s1"]);
    expect(outline(apply({ operation: "move_section", sectionId: "s2", beforeSectionId: "s2" }).sections))
      .toEqual(outline(stored()));
  });

  it("remove_section removes a section but never the last one", () => {
    const removed = apply({ operation: "remove_section", sectionId: "s2" });
    expect(removed.sections.map(({ id }) => id)).toEqual(["s1", "s3"]);
    expect(removed).not.toHaveProperty("sectionId");

    const last = errorOf(() => apply({ operation: "remove_section", sectionId: "s1" }, [stored()[0]]));
    expect(last).toMatchObject({ code: "invalid_template", message: "A template needs at least one section" });
  });

  it("replace_task changes the fields it is given and keeps the rest, notes and ids included", () => {
    const retitled = apply({ operation: "replace_task", taskId: "t5", task: { title: "Smoke test" } });
    expect((retitled.sections[2].items as JsonRecord[])[1]).toEqual(task("t5", { notes: "kept", title: "Smoke test" }));
    expect(retitled.taskId).toBe("t5");

    const recontented = apply({
      operation: "replace_task",
      taskId: "t1",
      task: { id: "t1", contents: [{ type: "subItems", subItems: [{ id: "t1-sub", title: "Check" }, { title: "Double-check" }] }] },
    });
    const subItems = ((recontented.sections[0].items as JsonRecord[])[0].contents as JsonRecord[])[0].subItems as JsonRecord[];
    expect(subItems[0]).toEqual({ id: "t1-sub", title: "Check" });
    expect(subItems[1].id).toMatch(SUBITEM_ID);
    expect((recontented.sections[0].items as JsonRecord[])[0]).toMatchObject({ title: "Task t1", description: "About t1" });
  });

  it("insert_task adds a task before another or at the end of a section", () => {
    const atEnd = apply({ operation: "insert_task", sectionId: "s2", task: { title: "Announce" } });
    expect(outline(atEnd.sections)[1][1]).toEqual(["t3", atEnd.taskId]);
    expect(atEnd.taskId).toMatch(ITEM_ID);

    const before = apply({ operation: "insert_task", beforeTaskId: "t5", task: { id: "t9", title: "Warm up" } });
    expect(outline(before.sections)[2][1]).toEqual(["t4", "t9", "t5"]);
    expect(apply({ operation: "insert_task", sectionId: "s3", beforeTaskId: "t4", task: { title: "First" } }).sections[2].items)
      .toHaveLength(3);

    const elsewhere = errorOf(() => apply({ operation: "insert_task", sectionId: "s1", beforeTaskId: "t4", task: { title: "Lost" } }));
    expect(elsewhere).toMatchObject({ code: "task_not_found", message: "Task not found (beforeTaskId in sectionId)" });
  });

  it("move_task moves a task within or across sections, keeping its id and content", () => {
    const across = apply({ operation: "move_task", taskId: "t1", beforeTaskId: "t5" });
    expect(outline(across.sections)).toEqual([["s1", ["t2"]], ["s2", ["t3"]], ["s3", ["t4", "t1", "t5"]]]);
    expect((across.sections[2].items as JsonRecord[])[1]).toEqual(task("t1"));

    const toEnd = apply({ operation: "move_task", taskId: "t4", sectionId: "s3" });
    expect(outline(toEnd.sections)[2][1]).toEqual(["t5", "t4"]);
    expect(outline(apply({ operation: "move_task", taskId: "t4", beforeTaskId: "t4" }).sections)).toEqual(outline(stored()));

    const emptied = errorOf(() => apply({ operation: "move_task", taskId: "t3", sectionId: "s1" }));
    expect(emptied).toMatchObject({ code: "invalid_template", message: "A section needs at least one task; remove the section instead" });
    // A section's only task can still move within it.
    expect(outline(apply({ operation: "move_task", taskId: "t3", sectionId: "s2" }).sections)).toEqual(outline(stored()));
  });

  it("remove_task removes a task but never a section's last one", () => {
    const removed = apply({ operation: "remove_task", taskId: "t1" });
    expect(outline(removed.sections)[0]).toEqual(["s1", ["t2"]]);
    expect(removed).not.toHaveProperty("taskId");
    expect(errorOf(() => apply({ operation: "remove_task", taskId: "t3" })).code).toBe("invalid_template");
  });

  it("names the argument whose id it cannot find", () => {
    expect(errorOf(() => apply({ operation: "replace_section", sectionId: "nope", section: { title: "X" } })))
      .toMatchObject({ code: "section_not_found", message: "Section not found (sectionId)" });
    expect(errorOf(() => apply({ operation: "move_section", sectionId: "s1", beforeSectionId: "nope" })))
      .toMatchObject({ code: "section_not_found", message: "Section not found (beforeSectionId)" });
    expect(errorOf(() => apply({ operation: "insert_section", section: { title: "X", items: [{ title: "Y" }] }, beforeSectionId: "nope" })))
      .toMatchObject({ message: "Section not found (beforeSectionId)" });
    expect(errorOf(() => apply({ operation: "remove_task", taskId: "nope" })))
      .toMatchObject({ code: "task_not_found", message: "Task not found (taskId)" });
    expect(errorOf(() => apply({ operation: "insert_task", beforeTaskId: "nope", task: { title: "X" } })))
      .toMatchObject({ code: "task_not_found", message: "Task not found (beforeTaskId)" });
  });

  it("never changes the sections it was given", () => {
    const sections = stored();
    const before = JSON.stringify(sections);
    apply({ operation: "move_task", taskId: "t1", beforeTaskId: "t5" }, sections);
    apply({ operation: "remove_section", sectionId: "s2" }, sections);
    apply({ operation: "replace_task", taskId: "t4", task: { title: "Changed" } }, sections);
    expect(JSON.stringify(sections)).toBe(before);
  });
});

describe("update_template operation arguments", () => {
  const parse = (args: JsonRecord) => parseToolArguments(templateOperationArgs, { templateId: "tpl-1", expectedVersion: 4, ...args });

  it.each([
    ["replace_section without a change", { operation: "replace_section", sectionId: "s1", section: {} }, "section: Pass title, items, or both"],
    ["a section id other than sectionId", { operation: "replace_section", sectionId: "s1", section: { id: "s2", title: "X" } }, "section.id: A section keeps its id"],
    ["replace_task without a change", { operation: "replace_task", taskId: "t1", task: {} }, "task: Pass title, description, contents"],
    ["a task id other than taskId", { operation: "replace_task", taskId: "t1", task: { id: "t2", title: "X" } }, "task.id: A task keeps its id"],
    ["insert_task with nowhere to go", { operation: "insert_task", task: { title: "X" } }, "sectionId: Pass sectionId, beforeTaskId, or both"],
    ["move_task with nowhere to go", { operation: "move_task", taskId: "t1" }, "sectionId: Pass sectionId, beforeTaskId, or both"],
    ["a new section without tasks", { operation: "insert_section", section: { title: "X", items: [] } }, "section.items"],
    ["a field replacement beside an operation", { operation: "remove_task", taskId: "t1", title: "Renamed" }, "Unrecognized key(s) in object: 'title'"],
    ["an operation it does not know", { operation: "remove_template" }, "operation: Invalid discriminator value"],
  ])("refuses %s, naming the field", (_name, args, message) => {
    const error = errorOf(() => parse(args));
    expect(error.code).toBe("invalid_arguments");
    expect(error.message).toContain(message);
  });
});
