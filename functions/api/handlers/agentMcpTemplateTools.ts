import { z } from "zod";
import {
  portableChecklistItemContentSchema,
  portableChecklistItemSchema,
  portableChecklistSectionSchema,
} from "../../../src/lib/schemas/checklistSchema";

// The personal run MCP's template tools: their argument validators and the definitions
// functions/api/handlers/agentMcpTools.ts advertises. Nothing here imports the MCP handlers, so
// every handler module can import it. Their results stay within MAX_RESULT_BYTES
// (agentMcpPages.ts): get_template reads a larger template in parts
// (agentMcpTemplatePages.ts), and update_template's operations edit it a part at a time.

const idArg = z.string().trim().min(1);

// The nextCursor of a paged result, for every tool that pages (agentMcpPages.ts).
export const cursorArg = z.string().trim().min(1).max(4096);
export const cursorJsonSchema = {
  type: "string",
  description: "The nextCursor of the previous result, to read what follows.",
} as const;

export const listTemplatesArgs = z.object({ cursor: cursorArg.optional() }).strict();

export const getTemplateArgs = z.object({
  templateId: idArg,
  sectionId: idArg.optional(),
  taskId: idArg.optional(),
  cursor: cursorArg.optional(),
}).strict();

// Template writes are private Personal templates only: no visibility, Organization, or slug
// fields (.strict() refuses them).
const templateTitleArg = z.string().trim().min(1).max(160);
const templateDescriptionArg = z.string().max(5000);
const templateSectionsArg = z.array(portableChecklistSectionSchema).min(1).max(100);
const templateLabelsArg = z.array(z.string().trim().min(1).max(80)).max(20);

export const createTemplateArgs = z.object({
  title: templateTitleArg,
  description: templateDescriptionArg.optional(),
  sections: templateSectionsArg,
  categories: templateLabelsArg.optional(),
  tags: templateLabelsArg.optional(),
}).strict();

export const updateTemplateArgs = z.object({
  templateId: idArg,
  expectedVersion: z.number().int().positive(),
  title: templateTitleArg.optional(),
  description: templateDescriptionArg.optional(),
  sections: templateSectionsArg.optional(),
  categories: templateLabelsArg.optional(),
  tags: templateLabelsArg.optional(),
}).strict().refine(
  ({ templateId: _templateId, expectedVersion: _expectedVersion, ...changes }) => Object.keys(changes).length > 0,
  "Provide at least one of title, description, sections, categories, or tags",
);

// The part of a section or task a replace operation changes: the fields it passes replace
// the stored ones, and the ones it leaves out are kept.
const sectionChangeArg = z.object({
  id: z.string().optional(),
  title: z.string().min(1).optional(),
  items: z.array(portableChecklistItemSchema).min(1).optional(),
});
const taskChangeArg = z.object({
  id: z.string().optional(),
  title: z.string().min(1).optional(),
  description: z.string().optional(),
  contents: z.array(portableChecklistItemContentSchema).optional(),
});

const operationBase = { templateId: idArg, expectedVersion: z.number().int().positive() };

/**
 * update_template's operations, each of which changes one section or task. A template too
 * large to read in one result is read a section or task at a time, so it must be editable at
 * the same size: an operation never sends more than get_template returned.
 */
export const templateOperationArgs = z.discriminatedUnion("operation", [
  z.object({ ...operationBase, operation: z.literal("replace_section"), sectionId: idArg, section: sectionChangeArg }).strict(),
  z.object({
    ...operationBase,
    operation: z.literal("insert_section"),
    section: portableChecklistSectionSchema,
    beforeSectionId: idArg.optional(),
  }).strict(),
  z.object({ ...operationBase, operation: z.literal("move_section"), sectionId: idArg, beforeSectionId: idArg.optional() }).strict(),
  z.object({ ...operationBase, operation: z.literal("remove_section"), sectionId: idArg }).strict(),
  z.object({ ...operationBase, operation: z.literal("replace_task"), taskId: idArg, task: taskChangeArg }).strict(),
  z.object({
    ...operationBase,
    operation: z.literal("insert_task"),
    task: portableChecklistItemSchema,
    sectionId: idArg.optional(),
    beforeTaskId: idArg.optional(),
  }).strict(),
  z.object({
    ...operationBase,
    operation: z.literal("move_task"),
    taskId: idArg,
    sectionId: idArg.optional(),
    beforeTaskId: idArg.optional(),
  }).strict(),
  z.object({ ...operationBase, operation: z.literal("remove_task"), taskId: idArg }).strict(),
]).superRefine((args, context) => {
  const issue = (path: (string | number)[], message: string) => context.addIssue({ code: "custom", path, message });
  if (args.operation === "replace_section") {
    if (args.section.title === undefined && args.section.items === undefined) issue(["section"], "Pass title, items, or both");
    if (args.section.id !== undefined && args.section.id !== args.sectionId) {
      issue(["section", "id"], "A section keeps its id: leave it out or pass sectionId");
    }
  }
  if (args.operation === "replace_task") {
    const { title, description, contents } = args.task;
    if (title === undefined && description === undefined && contents === undefined) {
      issue(["task"], "Pass title, description, contents, or several of them");
    }
    if (args.task.id !== undefined && args.task.id !== args.taskId) {
      issue(["task", "id"], "A task keeps its id: leave it out or pass taskId");
    }
  }
  if ((args.operation === "insert_task" || args.operation === "move_task") && !args.sectionId && !args.beforeTaskId) {
    issue(["sectionId"], "Pass sectionId, beforeTaskId, or both");
  }
});

export type TemplateOperationArgs = z.infer<typeof templateOperationArgs>;

const templateTaskProperties = {
  id: { type: "string" },
  title: { type: "string", minLength: 1 },
  description: { type: "string" },
  contents: {
    type: "array",
    items: {
      type: "object",
      properties: {
        id: { type: "string" },
        type: { type: "string", enum: ["text", "image", "video", "file", "embed", "subItems"] },
        value: { type: "string", description: "Markdown for text; a URL for image, video, file, and embed." },
        subItems: {
          type: "array",
          items: {
            type: "object",
            properties: { id: { type: "string" }, title: { type: "string", minLength: 1 } },
            required: ["title"],
          },
        },
      },
      required: ["type"],
    },
  },
} as const;

const templateTasksJsonSchema = {
  type: "array",
  minItems: 1,
  items: { type: "object", properties: templateTaskProperties, required: ["title"] },
} as const;

const templateSectionsJsonSchema = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  description: "Sections in order. Keep the id of every existing section, task, and subtask you change so run "
    + "progress follows it; omit ids for new ones.",
  items: {
    type: "object",
    properties: { id: { type: "string" }, title: { type: "string", minLength: 1 }, items: templateTasksJsonSchema },
    required: ["title", "items"],
  },
} as const;

const templateLabelsJsonSchema = {
  type: "array",
  maxItems: 20,
  items: { type: "string", minLength: 1, maxLength: 80 },
} as const;

const TEMPLATE_OPERATIONS = [
  "replace_section",
  "insert_section",
  "move_section",
  "remove_section",
  "replace_task",
  "insert_task",
  "move_task",
  "remove_task",
] as const satisfies readonly TemplateOperationArgs["operation"][];

export const templateToolDefinitions = [
  {
    name: "list_templates",
    description: "List the authenticated user's active personal SOP templates, most recently edited or created "
      + "first: each template's id, title, description, type, contentVersion, and dates. No result is larger than "
      + "32KB, so the list comes a page at a time (titles over 160 characters and descriptions over 500 are cut; "
      + "get_template returns them whole). While a result has nextCursor, call list_templates with cursor set to "
      + "it for the next page.",
    inputSchema: {
      type: "object",
      properties: { cursor: cursorJsonSchema },
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "get_template",
    description: "Read a personal template: its sections, tasks, subtasks, ids, and version. No result is larger "
      + "than 32KB, what MCP clients take from one call, so a larger template comes back as an outline instead "
      + "(sectionsOmitted, and outline: each section's id, title, taskCount, and bytes). Read a section with "
      + "sectionId, or one task with taskId. A section too large for one result comes back a page of tasks at a "
      + "time (section.firstTask and section.taskCount say which), and anything too large for a result on its "
      + "own, such as a very long task, comes back as part: pieces of its JSON text to join in order. While a "
      + "result has nextCursor, call get_template with templateId and cursor set to it for the rest. A cursor "
      + "reads the version it started from: once the template changes it fails with edit_conflict, so start again "
      + "without it.",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        sectionId: { type: "string", description: "Read only this section, in pages if it is too large for one result." },
        taskId: { type: "string", description: "Read only this task." },
        cursor: cursorJsonSchema,
      },
      required: ["templateId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_template",
    description: "Create a private personal template. Returns it whole when it fits in one result (32KB); "
      + "otherwise its fields without sections (sectionsOmitted), to read with get_template.",
    inputSchema: {
      type: "object",
      properties: {
        title: { type: "string", minLength: 1, maxLength: 160 },
        description: { type: "string", maxLength: 5000 },
        sections: templateSectionsJsonSchema,
        categories: templateLabelsJsonSchema,
        tags: templateLabelsJsonSchema,
      },
      required: ["title", "sections"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: false, idempotentHint: false, openWorldHint: false },
  },
  {
    name: "update_template",
    description: "Update a private personal template (public templates can only be edited in SERP Lists). "
      + "Pass the latest version from get_template or the previous update_template as expectedVersion to "
      + "prevent lost updates. Either replace the fields you pass: title, description, categories, tags, or "
      + "sections, which replaces the whole checklist: any section, task, or subtask it leaves out is removed. "
      + "Or change one part with operation, which never needs more than get_template returned. For a template "
      + "read in pages (get_template returned an outline or nextCursor), operation is the safe way to edit it: "
      + "no one result holds the whole checklist that sections would have to send back. "
      + "replace_section needs sectionId and section (title, items, or both; items replace its tasks); "
      + "insert_section needs section (title and items), added before beforeSectionId or at the end; "
      + "move_section needs sectionId, moved before beforeSectionId or to the end; remove_section needs sectionId; "
      + "replace_task needs taskId and task (title, description, contents, or several); insert_task needs task "
      + "and sectionId or beforeTaskId (added before that task or at the end of the section); move_task needs "
      + "taskId and sectionId or beforeTaskId; remove_task needs taskId. A field section or task leaves out is "
      + "kept. Keep the id of every section, task, and subtask you keep so run progress follows it; new ones get "
      + "ids. Returns the template whole when it fits in one result (32KB), otherwise its fields with "
      + "sectionsOmitted and the section or task the operation changed; sectionId and taskId name it. "
      + "In-progress private runs of the template pick up the change.",
    // One flat object, as update_run's: model APIs reject a oneOf at the root of a tool schema.
    // templateOperationArgs enforces which fields each operation needs.
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        expectedVersion: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1, maxLength: 160 },
        description: { type: "string", maxLength: 5000 },
        sections: {
          ...templateSectionsJsonSchema,
          description: "The whole checklist, its sections in order: it replaces every section, and any section, "
            + "task, or subtask left out is removed. For a template read in pages, change it with operation "
            + "instead. Keep the id of every section, task, and subtask you keep so run progress follows it; omit "
            + "ids for new ones.",
        },
        categories: templateLabelsJsonSchema,
        tags: templateLabelsJsonSchema,
        operation: {
          type: "string",
          enum: TEMPLATE_OPERATIONS,
          description: "Change one section or task instead of replacing fields; pass no field to replace with it.",
        },
        sectionId: {
          type: "string",
          description: "replace_section, move_section, remove_section: the section. insert_task, move_task: "
            + "the section the task goes to.",
        },
        beforeSectionId: {
          type: "string",
          description: "insert_section, move_section: the section it goes before; leave out for the end.",
        },
        section: {
          type: "object",
          description: "replace_section: the fields to replace. insert_section: the new section.",
          properties: { id: { type: "string" }, title: { type: "string", minLength: 1 }, items: templateTasksJsonSchema },
        },
        taskId: { type: "string", description: "replace_task, move_task, remove_task: the task." },
        beforeTaskId: {
          type: "string",
          description: "insert_task, move_task: the task it goes before; leave out for the end of sectionId.",
        },
        task: {
          type: "object",
          description: "replace_task: the fields to replace. insert_task: the new task (title required).",
          properties: templateTaskProperties,
        },
      },
      required: ["templateId", "expectedVersion"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
] as const;
