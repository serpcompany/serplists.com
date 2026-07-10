import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { audit_events } from "../schema/auditEvents";

export type AuditEvent = InferSelectModel<typeof audit_events>;
export type NewAuditEvent = InferInsertModel<typeof audit_events>;
