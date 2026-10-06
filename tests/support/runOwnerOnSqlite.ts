import { sessionMocks } from "./mockedSession";
import { callToolWithAFreshRunKey, openAFreshMcpDatabase } from "./agentMcpOnSqlite";

import { handleChecklists } from "@functions/api/handlers/checklists";
import { apiEnvOn } from "./apiEnv";
import { present } from "./elements";
import { apiErrorBody, readJson } from "./readJson";
import type { SqliteD1 } from "./sqlite-d1";

const NOW = "2026-10-01T00:00:00.000Z";

export type RunWriteRefusal = { status: number | "tool error"; code: unknown; message: unknown; details?: unknown };

export function openRunOwnerDatabase(templateItems: string): SqliteD1 {
  const database = openAFreshMcpDatabase();
  sessionMocks.getSessionUserId.mockResolvedValue("user-1");
  database.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'user-1@example.test', 'User', 1, ?)", NOW);
  database.run(
    `INSERT INTO templates (id, user_id, title, items, is_public, created_at, version, type, owner_type, team_id,
      created_by_user_id, content_version, deleted_at)
     VALUES ('template-1', 'user-1', 'Template', ?, 0, ?, 1, 'checklist', 'user', NULL, 'user-1', 1, NULL)`,
    templateItems, NOW,
  );
  return database;
}

export function insertOwnedRun(
  database: SqliteD1,
  run: { id: string; status: "in_progress" | "completed"; items: string; shareToken?: string },
) {
  database.run(
    `INSERT INTO checklist_runs (id, user_id, team_id, template_id, title, items, status, started_at, completed_at, created_at,
      progress, created_by_user_id, started_by_user_id, template_version, revision, retired_items, is_public, share_token, deleted_at)
     VALUES (?, 'user-1', NULL, 'template-1', 'Run', ?, ?, ?, ?, ?, 100, 'user-1', 'user-1', 1, 1, '[]', ?, ?, NULL)`,
    run.id, run.items, run.status, NOW, run.status === "completed" ? NOW : null, NOW,
    run.shareToken ? 1 : 0, run.shareToken ?? null,
  );
}

export function storedValue(database: SqliteD1, query: string, ...params: string[]): unknown {
  const { value } = present(database.sqlite.prepare(query).get(...params), "the value");
  return value;
}

export async function checklistsRefusal(database: SqliteD1, request: Request): Promise<RunWriteRefusal | null> {
  const response = await handleChecklists(request, apiEnvOn(database));
  if (response.status === 200) return null;
  const body = await readJson(response, apiErrorBody);
  return { status: response.status, code: body.code, message: body.error, details: body.details };
}

export async function updateRunRefusal(database: SqliteD1, args: Record<string, unknown>): Promise<RunWriteRefusal | null> {
  const { result } = await callToolWithAFreshRunKey(database, "update_run", args);
  if (!result.isError) return null;
  const { error, message, details } = result.structuredContent;
  return { status: "tool error", code: error, message, details };
}
