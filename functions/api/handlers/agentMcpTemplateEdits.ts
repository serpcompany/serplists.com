import { isSubTasksBlock } from "../../../src/lib/schemas/storedSections";
import { getId } from "../utils/template-identities";
import { findSection, findTask, tasksOf } from "./agentMcpPages";
import type { TemplateOperationArgs } from "./agentMcpTemplateTools";
import { isRecord, ToolError, type JsonRecord } from "./agentMcpTools";

// update_template's operations: each changes one section or task of the sections get_template
// returns, and update_template saves the result through the web editor's code, as it saves a
// whole checklist. So an agent edits a template too large to read at once a part at a time,
// and never sends more than get_template returned.

export type TemplateEdit = { sections: JsonRecord[]; sectionId?: string; taskId?: string };

// Ids for the sections, tasks and Sub-tasks an operation adds, in the web editor's format
// (src/lib/forms/templateEditorForm.ts). A save would number them by position instead, which
// can repeat an id the template already holds elsewhere.
const newId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

function withTaskIds(task: JsonRecord): JsonRecord {
  const withSubTaskIds = (content: unknown) => (isSubTasksBlock(content) && Array.isArray(content.subItems)
    ? {
      ...content,
      subItems: content.subItems.map((subItem) =>
        (isRecord(subItem) && !getId(subItem) ? { ...subItem, id: newId("subitem") } : subItem)),
    }
    : content);
  return {
    ...task,
    id: getId(task) ?? newId("item"),
    ...(Array.isArray(task.contents) ? { contents: task.contents.map(withSubTaskIds) } : {}),
  };
}

type Section = JsonRecord & { items: JsonRecord[] };

function withSectionIds(section: JsonRecord): Section {
  return { ...section, id: getId(section) ?? newId("section"), items: tasksOf(section).map(withTaskIds) };
}

const needsATask = () => new ToolError("A section needs at least one task; remove the section instead", "invalid_template");

// Where insert_task and move_task put a task: before beforeTaskId, else at the end of sectionId.
function insertionPoint(sections: JsonRecord[], sectionId?: string, beforeTaskId?: string): { tasks: JsonRecord[]; at: number } {
  if (beforeTaskId !== undefined) {
    const { sectionIndex, taskIndex } = findTask(sections, beforeTaskId, sectionId, "beforeTaskId");
    return { tasks: sections[sectionIndex].items as JsonRecord[], at: taskIndex };
  }
  const tasks = sections[findSection(sections, sectionId as string)].items as JsonRecord[];
  return { tasks, at: tasks.length };
}

/**
 * Applies one operation to `stored` (get_template's sections), returning the whole checklist
 * to save and the section or task it changed. Section and task fields the operation leaves out
 * are kept; new sections, tasks and Sub-tasks get ids.
 */
export function applyTemplateOperation(stored: JsonRecord[], args: TemplateOperationArgs): TemplateEdit {
  // Copies of each section and its task list, so the lists can be spliced.
  const sections: Section[] = stored.map((section) => ({ ...section, items: [...tasksOf(section)] }));
  const tasksAt = (index: number) => sections[index].items;

  switch (args.operation) {
    case "replace_section": {
      const index = findSection(sections, args.sectionId);
      const { id: _id, items, ...fields } = args.section;
      sections[index] = { ...sections[index], ...fields, ...(items ? { items: items.map(withTaskIds) } : {}) };
      return { sections, sectionId: args.sectionId };
    }
    case "insert_section": {
      const section = withSectionIds(args.section);
      const at = args.beforeSectionId === undefined
        ? sections.length
        : findSection(sections, args.beforeSectionId, "beforeSectionId");
      sections.splice(at, 0, section);
      return { sections, sectionId: section.id as string };
    }
    case "move_section": {
      const from = findSection(sections, args.sectionId);
      if (args.beforeSectionId === args.sectionId) return { sections, sectionId: args.sectionId };
      const [section] = sections.splice(from, 1);
      const at = args.beforeSectionId === undefined
        ? sections.length
        : findSection(sections, args.beforeSectionId, "beforeSectionId");
      sections.splice(at, 0, section);
      return { sections, sectionId: args.sectionId };
    }
    case "remove_section": {
      const index = findSection(sections, args.sectionId);
      if (sections.length === 1) throw new ToolError("A template needs at least one section", "invalid_template");
      sections.splice(index, 1);
      return { sections };
    }
    case "replace_task": {
      const { sectionIndex, taskIndex } = findTask(sections, args.taskId);
      const { id: _id, ...fields } = args.task;
      tasksAt(sectionIndex)[taskIndex] = withTaskIds({ ...tasksAt(sectionIndex)[taskIndex], ...fields });
      return { sections, taskId: args.taskId };
    }
    case "insert_task": {
      const task = withTaskIds(args.task);
      const { tasks, at } = insertionPoint(sections, args.sectionId, args.beforeTaskId);
      tasks.splice(at, 0, task);
      return { sections, taskId: task.id as string };
    }
    case "move_task": {
      if (args.beforeTaskId === args.taskId) {
        findTask(sections, args.taskId, args.sectionId);
        return { sections, taskId: args.taskId };
      }
      const from = findTask(sections, args.taskId);
      const [task] = tasksAt(from.sectionIndex).splice(from.taskIndex, 1);
      const { tasks, at } = insertionPoint(sections, args.sectionId, args.beforeTaskId);
      if (tasksAt(from.sectionIndex).length === 0 && tasks !== tasksAt(from.sectionIndex)) throw needsATask();
      tasks.splice(at, 0, task);
      return { sections, taskId: args.taskId };
    }
    case "remove_task": {
      const { sectionIndex, taskIndex } = findTask(sections, args.taskId);
      if (tasksAt(sectionIndex).length === 1) throw needsATask();
      tasksAt(sectionIndex).splice(taskIndex, 1);
      return { sections };
    }
  }
}
