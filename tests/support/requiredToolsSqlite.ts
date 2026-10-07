import { z } from "zod";

import { sessionMocks } from "./mockedSession";
import { handleChecklists } from "@functions/api/handlers/checklists";
import { handleTemplates } from "@functions/api/handlers/templates";
import { apiEnvOn } from "./apiEnv";
import { onlyElement } from "./elements";
import { jsonObject, readJson } from "./readJson";
import { SqliteD1 } from "./sqlite-d1";

export const TOOLS_SEEDED_AT = "2026-10-05T00:00:00.000Z";
export const TIME_TRACKER = { name: "Time tracker", url: "https://example.com/track", required: true };
export const SLIDESHOW_APP = { name: "Slideshow app", url: "https://example.com/slides?deck=1", required: false };
export const ONE_TASK = [{ id: "s1", title: "Prepare", items: [{ id: "i1", title: "Open the tracker" }] }];

export const toolsOf = z.object({ requiredTools: z.unknown() }).passthrough();
const savedTemplate = z.object({ id: z.string(), version: z.number().optional() }).passthrough();

export let d1: SqliteD1;

const PEOPLE = {
  alice: "pro",
  carol: "pro",
  bob: null,
} as const;

export function openTheToolsDatabase(): void {
  d1 = new SqliteD1();
  for (const [id, plan] of Object.entries(PEOPLE)) {
    d1.run(
      "INSERT INTO users (id, email, name, username, email_verified, created_at) VALUES (?, ?, ?, ?, 1, ?)",
      id, `${id}@example.test`, `${id[0]?.toUpperCase()}${id.slice(1)}`, id, TOOLS_SEEDED_AT,
    );
    if (plan) d1.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES (?, ?, ?)", id, plan, TOOLS_SEEDED_AT);
  }
  d1.run(
    "INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at) VALUES ('org-1', 'Launch Org', 'launch-org', 'alice', 'alice', ?)",
    TOOLS_SEEDED_AT,
  );
  for (const [user, role] of [["alice", "owner"], ["bob", "runner"]]) {
    d1.run(
      "INSERT INTO team_members (id, team_id, user_id, role, status, created_at) VALUES (?, 'org-1', ?, ?, 'active', ?)",
      `org-1-${String(user)}`, user, role, TOOLS_SEEDED_AT,
    );
  }
}

function sendTo(handler: typeof handleTemplates, userId: string | null, method: string, path: string, body?: unknown) {
  sessionMocks.getSessionUserId.mockResolvedValue(userId);
  return handler(
    new Request(`http://localhost/api/${path}`, { method, ...(body === undefined ? {} : { body: JSON.stringify(body) }) }),
    apiEnvOn(d1),
  );
}

export const templatesApi = (userId: string | null, method: string, path: string, body?: unknown) =>
  sendTo(handleTemplates, userId, method, `templates${path}`, body);

export const runsApi = (userId: string, path: string) => sendTo(handleChecklists, userId, "GET", `checklists${path}`);

export async function createTemplateAs(userId: string, body: Record<string, unknown>): Promise<string> {
  const response = await templatesApi(userId, "POST", "", { sections: ONE_TASK, ...body });
  if (response.status !== 200) throw new Error(`create answered ${response.status}: ${await response.text()}`);
  return (await readJson(response, savedTemplate)).id;
}

export async function readTemplateAs(userId: string | null, path: string) {
  const response = await templatesApi(userId, "GET", path);
  if (response.status !== 200) throw new Error(`read of ${path} answered ${response.status}`);
  return readJson(response, jsonObject);
}

export async function saveTemplateAs(userId: string, templateId: string, body: Record<string, unknown>) {
  const response = await templatesApi(userId, "PUT", `/${templateId}`, body);
  return { status: response.status, body: await readJson(response, jsonObject) };
}

export function storedColumns(templateId: string) {
  return onlyElement(
    d1.rows<{ required_tools: string | null; version: number; content_version: number }>(
      "SELECT required_tools, version, content_version FROM templates WHERE id = ?",
      templateId,
    ),
  );
}

export function versionSnapshot(templateId: string, version: number): unknown {
  const { snapshot_json } = onlyElement(
    d1.rows<{ snapshot_json: string }>("SELECT snapshot_json FROM template_versions WHERE template_id = ? AND version = ?", templateId, version),
  );
  return JSON.parse(snapshot_json);
}
