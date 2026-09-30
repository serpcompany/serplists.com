import { z } from "zod";
import { portableChecklistSectionSchema } from "../../../src/lib/schemas/checklistSchema";

// The personal run MCP's template tools: their argument validators, their result bound, and
// the definitions functions/api/handlers/agentMcpTools.ts advertises. Nothing here imports the
// MCP handlers, so every handler module can import it.

// The largest template tool result, in bytes of the JSON clients receive, so that MCP clients
// take every result whole. Claude Code sets a result over MAX_MCP_OUTPUT_TOKENS (25,000 tokens
// by default) aside in a file, and Codex cuts the middle out of one over its model's budget
// (10,000 tokens plus 20%, which it counts as 4 bytes each: 48,000 bytes). 32KB is 8,192 of
// Codex's tokens, and about 16,000 real ones even at 2 bytes a token (JSON dense with ids, or
// text in other scripts). get_template reads a larger template in parts
// (agentMcpTemplatePages.ts).
export const MAX_TEMPLATE_RESULT_BYTES = 32 * 1024;

const idArg = z.string().trim().min(1);

export const getTemplateArgs = z.object({
  templateId: idArg,
  sectionId: idArg.optional(),
  taskId: idArg.optional(),
  cursor: z.string().trim().min(1).max(512).optional(),
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

const templateSectionsJsonSchema = {
  type: "array",
  minItems: 1,
  maxItems: 100,
  description: "Sections in order. Keep the id of every existing section, task, and subtask you change so run "
    + "progress follows it; omit ids for new ones.",
  items: {
    type: "object",
    properties: {
      id: { type: "string" },
      title: { type: "string", minLength: 1 },
      items: {
        type: "array",
        minItems: 1,
        items: {
          type: "object",
          properties: {
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
          },
          required: ["title"],
        },
      },
    },
    required: ["title", "items"],
  },
} as const;

const templateLabelsJsonSchema = {
  type: "array",
  maxItems: 20,
  items: { type: "string", minLength: 1, maxLength: 80 },
} as const;

export const templateToolDefinitions = [
  {
    name: "list_templates",
    description: "List the authenticated user's active personal SOP templates, most recently edited or created "
      + "first, up to 100 (truncated is true when there are more).",
    inputSchema: { type: "object", properties: {}, additionalProperties: false },
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
        cursor: { type: "string", description: "The nextCursor of the previous result, to read what follows." },
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
      + "Fields you pass replace the stored ones; sections replaces the whole checklist. In-progress private runs "
      + "of the template pick up the change. Pass the latest version from get_template as expectedVersion to "
      + "prevent lost updates. Returns the template whole when it fits in one result (32KB), otherwise its "
      + "fields without sections (sectionsOmitted).",
    inputSchema: {
      type: "object",
      properties: {
        templateId: { type: "string" },
        expectedVersion: { type: "integer", minimum: 1 },
        title: { type: "string", minLength: 1, maxLength: 160 },
        description: { type: "string", maxLength: 5000 },
        sections: templateSectionsJsonSchema,
        categories: templateLabelsJsonSchema,
        tags: templateLabelsJsonSchema,
      },
      required: ["templateId", "expectedVersion"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: false, openWorldHint: false },
  },
] as const;
