import type { InferInsertModel, InferSelectModel } from "drizzle-orm";
import { auditEvents } from "../schema/auditEvents";

export type AuditEvent = InferSelectModel<typeof auditEvents>;
export type NewAuditEvent = InferInsertModel<typeof auditEvents>;
