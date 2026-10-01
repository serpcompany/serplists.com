import type { AuditAction, TemplateVersionAction } from "../../../src/lib/schemas/auditActions";
import { getTableColumns, sql, type SQL } from "drizzle-orm";
import { schema, type createDb } from "../db";
import { sha256Hex } from "./crypto";
import {
  capAuditColumn,
  compactAuditDiff,
  compactAuditSnapshot,
  MAX_AUDIT_USER_AGENT_LENGTH,
} from "./audit-compaction";

export type AuditSubject = {
  type: "user" | "team";
  id: string;
};

export type AuditResource = {
  type: "template" | "checklist_run" | "team" | "team_member" | "team_invite";
  id: string;
};

type JsonValue = Record<string, unknown> | unknown[] | string | number | boolean | null;

export type AuditEventInput = {
  actorUserId: string | null;
  subject: AuditSubject;
  resource: AuditResource;
  action: AuditAction;
  before?: JsonValue;
  after?: JsonValue;
  diff?: JsonValue;
  metadata?: JsonValue | undefined;
  request?: Request;
  createdAt?: string;
};

export type TemplateVersionInput = {
  templateId: string;
  version: number;
  changedByUserId: string;
  subject: AuditSubject;
  snapshot: JsonValue;
  changeSummary?: TemplateVersionAction;
  createdAt?: string;
};

function serializeJson(value: JsonValue | undefined): string | null {
  if (typeof value === "undefined") return null;
  return JSON.stringify(value);
}

function getClientIp(request?: Request): string | null {
  if (!request) return null;
  const forwarded = request.headers.get("CF-Connecting-IP")
    ?? request.headers.get("True-Client-IP")
    ?? request.headers.get("X-Forwarded-For");

  return forwarded?.split(",")[0]?.trim() || null;
}

async function getRequestAuditMetadata(request?: Request): Promise<{
  requestId: string | null;
  ipHash: string | null;
  userAgent: string | null;
}> {
  const ip = getClientIp(request);

  return {
    requestId: request?.headers.get("X-Request-Id") ?? request?.headers.get("CF-Ray") ?? null,
    ipHash: ip ? await sha256Hex(ip) : null,
    userAgent: request?.headers.get("User-Agent") ?? null,
  };
}

export async function buildAuditEventValues(input: AuditEventInput): Promise<typeof schema.audit_events.$inferInsert> {
  const requestMetadata = await getRequestAuditMetadata(input.request);

  return {
    id: crypto.randomUUID(),
    actor_user_id: input.actorUserId,
    subject_type: input.subject.type,
    subject_id: input.subject.id,
    resource_type: input.resource.type,
    resource_id: input.resource.id,
    action: input.action,
    before_json: await capAuditColumn(serializeJson(compactAuditSnapshot(input.before))),
    after_json: await capAuditColumn(serializeJson(compactAuditSnapshot(input.after))),
    diff_json: await capAuditColumn(serializeJson(compactAuditDiff(input.diff, input.before))),
    metadata_json: await capAuditColumn(serializeJson(input.metadata)),
    request_id: requestMetadata.requestId,
    ip_hash: requestMetadata.ipHash,
    user_agent: requestMetadata.userAgent?.slice(0, MAX_AUDIT_USER_AGENT_LENGTH) ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

export async function buildTemplateVersionValues(
  input: TemplateVersionInput,
): Promise<typeof schema.template_versions.$inferInsert> {
  const snapshotJson = serializeJson(input.snapshot) ?? "{}";

  return {
    id: crypto.randomUUID(),
    template_id: input.templateId,
    version: input.version,
    changed_by_user_id: input.changedByUserId,
    subject_type: input.subject.type,
    subject_id: input.subject.id,
    snapshot_json: snapshotJson,
    content_hash: await sha256Hex(snapshotJson),
    change_summary: input.changeSummary ?? null,
    created_at: input.createdAt ?? new Date().toISOString(),
  };
}

export function insertAuditEventWhen(
  db: ReturnType<typeof createDb>,
  auditEvent: typeof schema.audit_events.$inferInsert,
  condition: SQL,
) {
  const values = auditEvent as Record<string, unknown>;
  const columns = Object.keys(getTableColumns(schema.audit_events)).map((key) => sql`${values[key] ?? null}`);
  return db.insert(schema.audit_events).select(sql`select ${sql.join(columns, sql`, `)} where ${condition}`);
}
