import { and, eq, isNull } from "drizzle-orm";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import { describeErrorForLog, log } from "../utils/logger";
import type { PersonalRunKeyIdentity } from "../utils/personal-run-key";
import { applyTemplateOperation } from "./agentMcpTemplateEdits";
import { readTemplate, templateSections, templateView, writtenTemplateResult } from "./agentMcpTemplatePages";
import { createTemplateArgs, getTemplateArgs, templateOperationArgs, updateTemplateArgs } from "./agentMcpTemplateTools";
import { isRecord, parseToolArguments, ToolError, type JsonRecord } from "./agentMcpTools";
import { createTemplateForUser } from "./template-create";
import { updateTemplateForUser } from "./template-update";

// The personal run MCP's template tools. Writes go through the web editor's code
// (createTemplateForUser, updateTemplateForUser), so they get its validation, template limit,
// version check, history, and in-progress run sync, restricted to the key owner's private
// Personal templates. Every result stays within MAX_TEMPLATE_RESULT_BYTES
// (agentMcpTemplatePages.ts).

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

function mcpAuditMetadata(identity: PersonalRunKeyIdentity, operation?: string): JsonRecord {
  return {
    source: "mcp",
    ...(operation ? { operation } : {}),
    personalRunKeyId: identity.keyId,
    personalRunKeyName: identity.name,
  };
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

// A write has already committed, so its result must never come back as an error: the agent
// would retry, and a retried create makes a duplicate. A template too large for one result
// comes back without its sections (with the section or task an operation changed, if it
// fits); one that cannot be read back (archived since, or a failed read) as the write's own
// summary. Either way the agent reads the rest with get_template.
async function loadWrittenTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  written: JsonRecord & { id: string },
  changed: { sectionId?: string; taskId?: string } = {},
): Promise<JsonRecord> {
  let row: JsonRecord;
  try {
    row = await getOwnedTemplate(env, identity.userId, written.id) as unknown as JsonRecord;
  } catch (error) {
    log("warn", "mcp_template_reload_error", {
      requestId: request.headers.get("X-Request-Id") ?? undefined,
      keyId: identity.keyId,
      templateId: written.id,
      ...describeErrorForLog(error),
    });
    return { template: written, sectionsOmitted: true };
  }
  return writtenTemplateResult(templateView(row), changed);
}

export async function getTemplate(
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const { templateId, ...read } = parseToolArguments(getTemplateArgs, rawArguments);
  const template = await getOwnedTemplate(env, identity.userId, templateId);
  return readTemplate(templateView(template as unknown as JsonRecord), read);
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

// An operation changes one section or task of the version the agent read. It is applied to
// that version's sections, and the whole checklist is then saved as the editor saves it,
// against the same version, so a change made in between fails with edit_conflict.
async function updateTemplatePart(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  const args = parseToolArguments(templateOperationArgs, rawArguments);
  const stored = await getOwnedTemplate(env, identity.userId, args.templateId);
  // The editor's own refusals, before the operation reads sections it could not save.
  if (stored.is_public) throw new ToolError("Public templates can only be edited in SERP Lists", "template_is_public");
  if (args.expectedVersion !== stored.version) {
    throw new ToolError("Template changed since it was loaded. Refresh before saving again.", "edit_conflict", {
      expectedVersion: args.expectedVersion,
      currentVersion: stored.version,
    });
  }
  const edit = applyTemplateOperation(templateSections(stored.items), args);

  const updated = await readTemplateWrite(await updateTemplateForUser(
    request,
    env,
    identity.userId,
    args.templateId,
    { sections: edit.sections, expected_version: args.expectedVersion },
    { personalOnly: true, auditMetadata: mcpAuditMetadata(identity, args.operation) },
  ));
  return loadWrittenTemplate(request, env, identity, {
    id: args.templateId,
    ...(typeof updated.version === "number" ? { version: updated.version } : {}),
  }, { sectionId: edit.sectionId, taskId: edit.taskId });
}

export async function updateTemplate(
  request: Request,
  env: Env,
  identity: PersonalRunKeyIdentity,
  rawArguments: unknown,
): Promise<JsonRecord> {
  if (isRecord(rawArguments) && rawArguments.operation !== undefined && rawArguments.operation !== null) {
    return updateTemplatePart(request, env, identity, rawArguments);
  }
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
