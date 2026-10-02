import { describe, expect, it } from "vitest";
import { contentAt, elementAt, firstOf, present, sectionAt, subTaskAt, taskIn } from "../../../support/elements";

import { applyTemplateOperation } from "@functions/api/handlers/agentMcpTemplateEdits";
import { templateOperationArgs } from "@functions/api/handlers/agentMcpTemplateTools";
import { parseToolArguments } from "@functions/api/handlers/agentMcpTools";
import { toolErrorOf } from "../../../support/agentMcp";
import { recordsIn } from "../../../support/mcpResponses";
import { storedSections } from "../../../support/storedJson";

type JsonRecord = Record<string, unknown>;

const task = (id: string, extra: JsonRecord = {}) => ({
  id,
  title: `Task ${id}`,
  description: `About ${id}`,
  contents: [{ id: `${id}-c`, type: "subItems", value: "", subItems: [{ id: `${id}-sub`, title: "Check", isCompleted: false }] }],
  ...extra,
});

const KEY_THE_APP_DOES_NOT_KNOW = { collapsed: true };

const sectionsAsRead = (): JsonRecord[] => [
  { id: "s1", title: "Prepare", ...KEY_THE_APP_DOES_NOT_KNOW, items: [task("t1"), task("t2")] },
  { id: "s2", title: "Ship", items: [task("t3")] },
  { id: "s3", title: "Verify", items: [task("t4"), task("t5", { notes: "kept" })] },
];

const applyParsed = (args: JsonRecord, sections = sectionsAsRead()) =>
  applyTemplateOperation(sections, parseToolArguments(templateOperationArgs, { templateId: "tpl-1", expectedVersion: 4, ...args }));

const sectionsIn = (result: { sections: unknown }) => storedSections.parse(result.sections);

const outline = (sections: JsonRecord[]) =>
  storedSections.parse(sections).map((section) => [section.id, section.items.map((item) => item.id)]);

const SECTION_ID = /^section_[0-9a-f-]{36}$/;
const ITEM_ID = /^item_[0-9a-f-]{36}$/;
const SUBITEM_ID = /^subitem_[0-9a-f-]{36}$/;

describe("update_template operations", () => {
  it("replace_section changes the fields it is given and keeps the rest", () => {
    const renamed = applyParsed({ operation: "replace_section", sectionId: "s1", section: { title: "Get ready" } });
    expect(renamed.sections[0]).toEqual({ ...sectionsAsRead()[0], title: "Get ready" });
    expect(renamed.sectionId).toBe("s1");

    const replaced = applyParsed({
      operation: "replace_section",
      sectionId: "s1",
      section: { id: "s1", items: [{ id: "t2", title: "Kept task" }, { title: "New task", contents: [{ type: "subItems", subItems: [{ title: "New check" }] }] }] },
    });
    const replacedTasks = firstOf(sectionsIn(replaced)).items;
    const kept = firstOf(replacedTasks);
    const added = elementAt(replacedTasks, 1);
    expect(replaced.sections[0]).toMatchObject({ id: "s1", title: "Prepare", ...KEY_THE_APP_DOES_NOT_KNOW });
    expect(kept).toEqual({ id: "t2", title: "Kept task" });
    expect(added.id).toMatch(ITEM_ID);
    expect(subTaskAt(contentAt(added, 0), 0).id).toMatch(SUBITEM_ID);
    expect(outline(replaced.sections).slice(1)).toEqual(outline(sectionsAsRead()).slice(1));
  });

  it("insert_section adds a section before another or at the end, with ids for what lacks one", () => {
    const atEnd = applyParsed({ operation: "insert_section", section: { title: "Retro", items: [{ title: "Notes" }] } });
    const added = elementAt(atEnd.sections, 3);
    expect(added.id).toMatch(SECTION_ID);
    expect(firstOf(recordsIn(added.items)).id).toMatch(ITEM_ID);
    expect(atEnd.sectionId).toBe(added.id);

    const before = applyParsed({
      operation: "insert_section",
      section: { id: "s0", title: "Plan", items: [{ id: "t0", title: "Scope" }] },
      beforeSectionId: "s2",
    });
    expect(outline(before.sections).map(([id]) => id)).toEqual(["s1", "s0", "s2", "s3"]);
    expect(before.sectionId).toBe("s0");
  });

  it("move_section moves a section before another or to the end, and before itself leaves it", () => {
    expect(applyParsed({ operation: "move_section", sectionId: "s3", beforeSectionId: "s1" }).sections.map(({ id }) => id))
      .toEqual(["s3", "s1", "s2"]);
    expect(applyParsed({ operation: "move_section", sectionId: "s1" }).sections.map(({ id }) => id)).toEqual(["s2", "s3", "s1"]);
    expect(outline(applyParsed({ operation: "move_section", sectionId: "s2", beforeSectionId: "s2" }).sections))
      .toEqual(outline(sectionsAsRead()));
  });

  it("remove_section removes a section but never the last one", () => {
    const removed = applyParsed({ operation: "remove_section", sectionId: "s2" });
    expect(removed.sections.map(({ id }) => id)).toEqual(["s1", "s3"]);
    expect(removed).not.toHaveProperty("sectionId");

    const last = toolErrorOf(() => applyParsed({ operation: "remove_section", sectionId: "s1" }, [firstOf(sectionsAsRead())]));
    expect(last).toMatchObject({ code: "invalid_template", message: "A template needs at least one section" });
  });

  it("replace_task changes the fields it is given and keeps the rest, notes and ids included", () => {
    const retitled = applyParsed({ operation: "replace_task", taskId: "t5", task: { title: "Smoke test" } });
    expect(taskIn(sectionsIn(retitled), 2, 1)).toEqual(task("t5", { notes: "kept", title: "Smoke test" }));
    expect(retitled.taskId).toBe("t5");

    const recontented = applyParsed({
      operation: "replace_task",
      taskId: "t1",
      task: { id: "t1", contents: [{ type: "subItems", subItems: [{ id: "t1-sub", title: "Check" }, { title: "Double-check" }] }] },
    });
    const subItems = present(contentAt(taskIn(sectionsIn(recontented), 0, 0), 0).subItems, "the sub-tasks");
    expect(subItems[0]).toEqual({ id: "t1-sub", title: "Check" });
    expect(elementAt(subItems, 1).id).toMatch(SUBITEM_ID);
    expect(taskIn(sectionsIn(recontented), 0, 0)).toMatchObject({ title: "Task t1", description: "About t1" });
  });

  it("insert_task adds a task before another or at the end of a section", () => {
    const atEnd = applyParsed({ operation: "insert_task", sectionId: "s2", task: { title: "Announce" } });
    expect(elementAt(outline(atEnd.sections), 1)[1]).toEqual(["t3", atEnd.taskId]);
    expect(atEnd.taskId).toMatch(ITEM_ID);

    const before = applyParsed({ operation: "insert_task", beforeTaskId: "t5", task: { id: "t9", title: "Warm up" } });
    expect(elementAt(outline(before.sections), 2)[1]).toEqual(["t4", "t9", "t5"]);
    expect(sectionAt(applyParsed({ operation: "insert_task", sectionId: "s3", beforeTaskId: "t4", task: { title: "First" } }), 2).items)
      .toHaveLength(3);

    const elsewhere = toolErrorOf(() => applyParsed({ operation: "insert_task", sectionId: "s1", beforeTaskId: "t4", task: { title: "Lost" } }));
    expect(elsewhere).toMatchObject({ code: "task_not_found", message: "Task not found (beforeTaskId in sectionId)" });
  });

  it("move_task moves a task within or across sections, keeping its id and content", () => {
    const across = applyParsed({ operation: "move_task", taskId: "t1", beforeTaskId: "t5" });
    expect(outline(across.sections)).toEqual([["s1", ["t2"]], ["s2", ["t3"]], ["s3", ["t4", "t1", "t5"]]]);
    expect(taskIn(sectionsIn(across), 2, 1)).toEqual(task("t1"));

    const toEnd = applyParsed({ operation: "move_task", taskId: "t4", sectionId: "s3" });
    expect(elementAt(outline(toEnd.sections), 2)[1]).toEqual(["t5", "t4"]);
    expect(outline(applyParsed({ operation: "move_task", taskId: "t4", beforeTaskId: "t4" }).sections)).toEqual(outline(sectionsAsRead()));

    const emptied = toolErrorOf(() => applyParsed({ operation: "move_task", taskId: "t3", sectionId: "s1" }));
    expect(emptied).toMatchObject({ code: "invalid_template", message: "A section needs at least one task; remove the section instead" });
    const onlyTaskMovedWithinItsSection = applyParsed({ operation: "move_task", taskId: "t3", sectionId: "s2" });
    expect(outline(onlyTaskMovedWithinItsSection.sections)).toEqual(outline(sectionsAsRead()));
  });

  it("remove_task removes a task but never a section's last one", () => {
    const removed = applyParsed({ operation: "remove_task", taskId: "t1" });
    expect(outline(removed.sections)[0]).toEqual(["s1", ["t2"]]);
    expect(removed).not.toHaveProperty("taskId");
    expect(toolErrorOf(() => applyParsed({ operation: "remove_task", taskId: "t3" })).code).toBe("invalid_template");
  });

  it("names the argument whose id it cannot find", () => {
    expect(toolErrorOf(() => applyParsed({ operation: "replace_section", sectionId: "nope", section: { title: "X" } })))
      .toMatchObject({ code: "section_not_found", message: "Section not found (sectionId)" });
    expect(toolErrorOf(() => applyParsed({ operation: "move_section", sectionId: "s1", beforeSectionId: "nope" })))
      .toMatchObject({ code: "section_not_found", message: "Section not found (beforeSectionId)" });
    expect(toolErrorOf(() => applyParsed({ operation: "insert_section", section: { title: "X", items: [{ title: "Y" }] }, beforeSectionId: "nope" })))
      .toMatchObject({ message: "Section not found (beforeSectionId)" });
    expect(toolErrorOf(() => applyParsed({ operation: "remove_task", taskId: "nope" })))
      .toMatchObject({ code: "task_not_found", message: "Task not found (taskId)" });
    expect(toolErrorOf(() => applyParsed({ operation: "insert_task", beforeTaskId: "nope", task: { title: "X" } })))
      .toMatchObject({ code: "task_not_found", message: "Task not found (beforeTaskId)" });
  });

  it("never changes the sections it was given", () => {
    const sections = sectionsAsRead();
    const before = JSON.stringify(sections);
    applyParsed({ operation: "move_task", taskId: "t1", beforeTaskId: "t5" }, sections);
    applyParsed({ operation: "remove_section", sectionId: "s2" }, sections);
    applyParsed({ operation: "replace_task", taskId: "t4", task: { title: "Changed" } }, sections);
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
    const error = toolErrorOf(() => parse(args));
    expect(error.code).toBe("invalid_arguments");
    expect(error.message).toContain(message);
  });
});
