import { and, eq, isNull } from "drizzle-orm";
import { sanitizeStoredSections } from "../../../src/lib/schemas/storedSections";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { describeErrorForLog, log } from "../utils/logger";
import { normalizeSectionsPayload, normalizeStringArray, parseJsonArray } from "../utils/payloads";
import type { PersonalRunKeyIdentity } from "../utils/personal-run-key";
import { withStableTemplateIdentities } from "../utils/template-identities";
import { jsonByteLength } from "./agentMcpRuns";
import { createTemplateArgs, getTemplateArgs, updateTemplateArgs } from "./agentMcpTemplateTools";
import { isRecord, parseToolArguments, ToolError, type JsonRecord } from "./agentMcpTools";
import { createTemplateForUser, updateTemplateForUser } from "./templates";

// The personal run MCP's template tools. Writes go through the web editor's code
// (createTemplateForUser, updateTemplateForUser), so they get its validation, template limit,
// version check, history, and in-progress run sync, restricted to the key owner's private
// Personal templates.

// A write has committed before its result is read back, so the result stays well under the
// MCP result bound (MAX_RESULT_BYTES); a larger template comes back without its sections.
const MAX_WRITE_RESULT_BYTES = 256 * 1024;

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

// The sections an agent reads and sends back. Entries stored without ids get the ids a save
// stores, as the web editor reads them, so run progress follows them through update_template;
// text fields are always text.
function templateSections(items: unknown): JsonRecord[] {
  const { sections } = normalizeSectionsPayload(parseJsonArray(items) ?? []);
  return sanitizeStoredSections(withStableTemplateIdentities(sections));
}

function serializeTemplate(template: JsonRecord): JsonRecord {
  return {
    id: template.id,
    title: template.title,
    description: template.description,
    type: template.type,
    categories: normalizeStringArray(template.category),
    tags: normalizeStringArray(template.tags),
    sections: templateSections(template.items),
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

// A write has already committed, so its result must never come back as an error: the agent
// would retry, and a retried create makes a duplicate. An oversized template comes back
// without its sections; one that cannot be read back (archived since, or a failed read) as
// the write's own summary. Either way the agent reads it in full with get_template.
async function loadWrittenTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  written: JsonRecord & { id: string },
): Promise<JsonRecord> {
  let result: JsonRecord;
  try {
    result = await loadTemplate(env, identity.userId, written.id);
  } catch (error) {
    log("warn", "mcp_template_reload_error", {
      requestId: request.headers.get("X-Request-Id") ?? undefined,
      keyId: identity.keyId,
      templateId: written.id,
      ...describeErrorForLog(error),
    });
    return { template: written, sectionsOmitted: true };
  }
  if (jsonByteLength(result) <= MAX_WRITE_RESULT_BYTES) return result;
  const { sections: _sections, ...summary } = result.template as JsonRecord;
  return { template: summary, sectionsOmitted: true };
}

export async function getTemplate(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const args = parseToolArguments(getTemplateArgs, rawArguments);
  return loadTemplate(env, identity.userId, args.templateId);
}

export async function createTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const args = parseToolArguments(createTemplateArgs, rawArguments);

  const created = await readTemplateWrite(await createTemplateForUser(
    request,
    env,
    identity.userId,
    { ...args, is_public: false },
    { personalOnly: true, auditMetadata: mcpAuditMetadata(identity) },
  ));
  if (typeof created.id !== "string") throw new Error("Template write returned no id");
  return loadWrittenTemplate(request, env, identity, { id: created.id, title: args.title, version: 1 });
}

export async function updateTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const { templateId, expectedVersion, ...changes } = parseToolArguments(updateTemplateArgs, rawArguments);

  const updated = await readTemplateWrite(await updateTemplateForUser(
    request,
    env,
    identity.userId,
    templateId,
    { ...changes, expected_version: expectedVersion },
    { personalOnly: true, auditMetadata: mcpAuditMetadata(identity) },
  ));
  return loadWrittenTemplate(request, env, identity, {
    id: templateId,
    ...(typeof updated.version === "number" ? { version: updated.version } : {}),
  });
}
