import { and, eq, isNull } from "drizzle-orm";
import { z } from "zod";
import { portableChecklistSectionSchema } from "../../../src/lib/schemas/checklistSchema";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { isRecord, parseStoredSections, ToolError, type JsonRecord } from "../utils/mcp-tools";
import { normalizeStringArray } from "../utils/payloads";
import type { PersonalRunKeyIdentity } from "../utils/personal-run-key";
import { createTemplateForUser, updateTemplateForUser } from "./templates";

const getTemplateArgs = z.object({
  templateId: z.string().trim().min(1),
}).strict();

const templateTitleArg = z.string().trim().min(1).max(160);
const templateDescriptionArg = z.string().max(5000);
const templateSectionsArg = z.array(portableChecklistSectionSchema).min(1).max(100);
const templateLabelsArg = z.array(z.string().trim().min(1).max(80)).max(20);

const createTemplateArgs = z.object({
  title: templateTitleArg,
  description: templateDescriptionArg.optional(),
  sections: templateSectionsArg,
  categories: templateLabelsArg.optional(),
  tags: templateLabelsArg.optional(),
}).strict();

const updateTemplateArgs = z.object({
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
  description: "Sections in order. Keep the id of every existing section, task, and subtask you change so run progress follows it; omit ids for new ones.",
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
    description: "Update a personal template. Fields you pass replace the stored ones; sections replaces the whole checklist. In-progress private runs of the template pick up the change. Pass the latest version from get_template as expectedVersion to prevent lost updates.",
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

const templateWriteErrorCodes: Record<number, string> = {
  400: "invalid_template",
  403: "forbidden",
  404: "template_not_found",
  409: "edit_conflict",
};

export async function getOwnedTemplate(env: Env, userId: string, templateId: string) {
  const [template] = await createDb(env)
    .select()
    .from(schema.templates)
    .where(and(
      eq(schema.templates.id, templateId),
      eq(schema.templates.user_id, userId),
      eq(schema.templates.owner_type, "user"),
      isNull(schema.templates.team_id),
      isNull(schema.templates.deleted_at),
    ))
    .limit(1);
  if (
    !template
    || template.user_id !== userId
    || template.owner_type !== "user"
    || template.team_id !== null
    || template.deleted_at !== null
  ) {
    throw new ToolError("Template not found", "template_not_found");
  }
  return template;
}

function serializeTemplate(template: JsonRecord): JsonRecord {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    type: template.type,
    categories: normalizeStringArray(template.category),
    tags: normalizeStringArray(template.tags),
    sections: parseStoredSections(template.items),
    version: typeof template.version === "number" ? template.version : 1,
    contentVersion: template.content_version,
    createdAt: template.created_at,
    updatedAt: template.updated_at,
  };
}

function mcpAuditMetadata(identity: PersonalRunKeyIdentity): JsonRecord {
  return { source: "mcp", personalRunKeyId: identity.keyId, personalRunKeyName: identity.name };
}

async function readTemplateWrite(response: Response): Promise<JsonRecord> {
  const body: unknown = await response.json().catch(() => null);
  if (response.ok && isRecord(body)) return body;
  if (response.status >= 500 || !isRecord(body)) throw new Error("Template write failed");
  throw new ToolError(
    typeof body.error === "string" ? body.error : "Unable to save the template",
    typeof body.code === "string" ? body.code : templateWriteErrorCodes[response.status] ?? "template_write_failed",
    isRecord(body.details) ? body.details : undefined,
  );
}

async function loadTemplate(env: Env, userId: string, templateId: string): Promise<JsonRecord> {
  const template = await getOwnedTemplate(env, userId, templateId);
  return { template: serializeTemplate(template as unknown as JsonRecord) };
}

export async function getTemplate(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = getTemplateArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");
  return loadTemplate(env, identity.userId, parsed.data.templateId);
}

export async function createTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = createTemplateArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");

  const created = await readTemplateWrite(await createTemplateForUser(
    request,
    env,
    identity.userId,
    { ...parsed.data, is_public: false },
    { personalOnly: true, auditMetadata: mcpAuditMetadata(identity) },
  ));
  if (typeof created.id !== "string") throw new Error("Template write returned no id");
  return loadTemplate(env, identity.userId, created.id);
}

export async function updateTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const parsed = updateTemplateArgs.safeParse(rawArguments ?? {});
  if (!parsed.success) throw new ToolError(parsed.error.issues[0]?.message ?? "Invalid arguments", "invalid_arguments");

  const { templateId, expectedVersion, ...changes } = parsed.data;
  await readTemplateWrite(await updateTemplateForUser(
    request,
    env,
    identity.userId,
    templateId,
    { ...changes, expected_version: expectedVersion },
    { personalOnly: true, auditMetadata: mcpAuditMetadata(identity) },
  ));
  return loadTemplate(env, identity.userId, templateId);
}
