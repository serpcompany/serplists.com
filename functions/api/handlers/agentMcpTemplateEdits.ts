import {
  isFormFieldRecord,
  isRecord,
  isSubTaskRecord,
  type FormFieldRecord,
  type SectionRecord,
  type TaskRecord,
} from "../../../src/lib/schemas/jsonRecords";
import { isFormBlock, isSubTasksBlock } from "../../../src/lib/schemas/storedSections";
import { getId } from "../utils/template-identities";
import { findSection, findTask, sectionAt, tasksOf } from "./agentMcpPages";
import type { TemplateOperationArgs } from "./agentMcpTemplateTools";
import { ToolError } from "./agentMcpTools";

export type TemplateEdit = { sections: SectionRecord[]; sectionId?: string; taskId?: string };

const newEditorId = (prefix: string) => `${prefix}_${crypto.randomUUID()}`;

const withOptionIds = (options: unknown[]) => options.map((option: unknown) =>
  (isRecord(option) && !getId(option) ? { ...option, id: newEditorId("option") } : option));

const withFieldId = (field: FormFieldRecord) => ({
  ...field,
  id: getId(field) ?? newEditorId("field"),
  ...(Array.isArray(field.options) ? { options: withOptionIds(field.options) } : {}),
});

function withContentIds(content: unknown): unknown {
  if (isFormBlock(content) && Array.isArray(content.fields)) {
    return { ...content, fields: content.fields.map((field: unknown) => (isFormFieldRecord(field) ? withFieldId(field) : field)) };
  }
  if (isSubTasksBlock(content) && Array.isArray(content.subItems)) {
    return {
      ...content,
      subItems: content.subItems.map((subItem: unknown) =>
        (isSubTaskRecord(subItem) && !getId(subItem) ? { ...subItem, id: newEditorId("subitem") } : subItem)),
    };
  }
  return content;
}

function withTaskIds(task: TaskRecord): TaskRecord & { id: string } {
  return {
    ...task,
    id: getId(task) ?? newEditorId("item"),
    ...(Array.isArray(task.contents) ? { contents: task.contents.map(withContentIds) } : {}),
  };
}

type Section = SectionRecord & { items: TaskRecord[] };

function withSectionIds(section: SectionRecord): Section & { id: string } {
  return { ...section, id: getId(section) ?? newEditorId("section"), items: tasksOf(section).map(withTaskIds) };
}

const needsATask = () => new ToolError("A section needs at least one task; remove the section instead", "invalid_template");

function taskInsertionPoint(sections: Section[], sectionId?: string, beforeTaskId?: string): { tasks: TaskRecord[]; at: number } {
  if (beforeTaskId !== undefined) {
    const { sectionIndex, taskIndex } = findTask(sections, beforeTaskId, sectionId, "beforeTaskId");
    return { tasks: sectionAt(sections, sectionIndex).items, at: taskIndex };
  }
  if (sectionId === undefined) throw new ToolError("sectionId: Pass sectionId, beforeTaskId, or both", "invalid_arguments");
  const tasks = sectionAt(sections, findSection(sections, sectionId)).items;
  return { tasks, at: tasks.length };
}

const spliceableCopy = (section: SectionRecord): Section => ({ ...section, items: [...tasksOf(section)] });

export function applyTemplateOperation(stored: SectionRecord[], args: TemplateOperationArgs): TemplateEdit {
  const sections: Section[] = stored.map(spliceableCopy);
  const tasksAt = (index: number) => sectionAt(sections, index).items;

  switch (args.operation) {
    case "replace_section": {
      const index = findSection(sections, args.sectionId);
      const { id, items, ...fields } = args.section;
      sections[index] = { ...sectionAt(sections, index), ...fields, ...(items ? { items: items.map(withTaskIds) } : {}) };
      return { sections, sectionId: args.sectionId };
    }
    case "insert_section": {
      const section = withSectionIds(args.section);
      const at = args.beforeSectionId === undefined
        ? sections.length
        : findSection(sections, args.beforeSectionId, "beforeSectionId");
      sections.splice(at, 0, section);
      return { sections, sectionId: section.id };
    }
    case "move_section": {
      const from = findSection(sections, args.sectionId);
      if (args.beforeSectionId === args.sectionId) return { sections, sectionId: args.sectionId };
      const section = sectionAt(sections, from);
      sections.splice(from, 1);
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
      const { id, ...fields } = args.task;
      tasksAt(sectionIndex)[taskIndex] = withTaskIds({ ...tasksAt(sectionIndex)[taskIndex], ...fields });
      return { sections, taskId: args.taskId };
    }
    case "insert_task": {
      const task = withTaskIds(args.task);
      const { tasks, at } = taskInsertionPoint(sections, args.sectionId, args.beforeTaskId);
      tasks.splice(at, 0, task);
      return { sections, taskId: task.id };
    }
    case "move_task": {
      if (args.beforeTaskId === args.taskId) {
        findTask(sections, args.taskId, args.sectionId);
        return { sections, taskId: args.taskId };
      }
      const from = findTask(sections, args.taskId);
      const [task] = tasksAt(from.sectionIndex).splice(from.taskIndex, 1);
      if (!task) throw new ToolError("Task not found (taskId)", "task_not_found");
      const { tasks, at } = taskInsertionPoint(sections, args.sectionId, args.beforeTaskId);
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
