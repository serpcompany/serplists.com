import { vi } from "vitest";
import { apiEnv } from "./apiEnv";
import { chainSelectsUpdatesAndDeletes } from "./drizzleChainMocks";

const dbMocks = await vi.hoisted(async () => (await import("./drizzleChainMocks")).drizzleChainMocks());

const sessionMocks = vi.hoisted(() => ({
  getSessionUserId: vi.fn(),
}));

const auditMocks = vi.hoisted(() => ({
  buildAuditEventValues: vi.fn(async (input: {
    actorUserId: string | null;
    subject: { type: string; id: string };
    resource: { type: string; id: string };
    action: string;
    before?: unknown;
    after?: unknown;
    diff?: unknown;
    metadata?: unknown;
    createdAt?: string;
  }) => ({
    id: "audit-event",
    actor_user_id: input.actorUserId,
    subject_type: input.subject.type,
    subject_id: input.subject.id,
    resource_type: input.resource.type,
    resource_id: input.resource.id,
    action: input.action,
    before_json: typeof input.before === "undefined" ? null : JSON.stringify(input.before),
    after_json: typeof input.after === "undefined" ? null : JSON.stringify(input.after),
    diff_json: typeof input.diff === "undefined" ? null : JSON.stringify(input.diff),
    metadata_json: typeof input.metadata === "undefined" ? null : JSON.stringify(input.metadata),
    request_id: null,
    ip_hash: null,
    user_agent: null,
    created_at: input.createdAt ?? "2026-01-01T00:00:00.000Z",
  })),
}));

vi.mock("drizzle-orm/d1", () => ({
  drizzle: vi.fn(() => dbMocks.db),
}));

vi.mock("@functions/api/utils/session", () => ({
  getSessionUserId: sessionMocks.getSessionUserId,
}));

vi.mock("@functions/api/utils/audit", () => ({
  buildAuditEventValues: auditMocks.buildAuditEventValues,
}));

export { auditMocks, dbMocks, sessionMocks };

export const mockEnv = apiEnv({ BETTER_AUTH_SECRET: "test-better-auth-secret-32-chars-minimum!!" });

export function resetTeamsHandlerMocks() {
  vi.clearAllMocks();
  chainSelectsUpdatesAndDeletes(dbMocks);
  dbMocks.selectChain.orderBy.mockResolvedValue([]);
  dbMocks.selectChain.limit.mockResolvedValue([]);
  dbMocks.insertChain.values.mockReturnValue(dbMocks.insertChain);
  dbMocks.insertChain.select.mockReturnValue(dbMocks.insertChain);
  dbMocks.insertChain.onConflictDoNothing.mockReturnValue(dbMocks.insertChain);
  dbMocks.db.batch.mockResolvedValue([]);
  auditMocks.buildAuditEventValues.mockClear();
  sessionMocks.getSessionUserId.mockResolvedValue("user-1");
}
