import { z } from "zod";
import { portableChecklistSectionSchema } from "../../../src/lib/schemas/checklistSchema";

// The personal run MCP's template tools: their argument validators and the definitions
// functions/api/handlers/agentMcpTools.ts advertises. Nothing here imports the MCP
// handlers, so every handler module can import it.

// Template writes are private Personal templates only: no visibility, Organization, or slug
// fields (.strict() refuses them).
export const getTemplateArgs = z.object({
  templateId: z.string().trim().min(1),
}).strict();

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
  templateId: z.string().trim().min(1),
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
    description: "Read a personal template, including its sections, tasks, subtasks, ids, and version.",
    inputSchema: {
      type: "object",
      properties: { templateId: { type: "string" } },
      required: ["templateId"],
      additionalProperties: false,
    },
    annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false },
  },
  {
    name: "create_template",
    description: "Create a private personal template.",
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
      + "prevent lost updates.",
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
