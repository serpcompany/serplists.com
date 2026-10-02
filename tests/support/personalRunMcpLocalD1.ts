import { mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import type { PlatformProxy } from "wrangler";
import { z } from "zod";
import { handleAgentMcp } from "../../functions/api/handlers/agentMcp";
import { createPersonalRunKeySecret } from "../../functions/api/utils/personal-run-key";
import { contentSaveBytes, TEMPLATE_CONTENT_MAX_BYTES } from "../../src/lib/schemas/contentLimits";
import { platformProxyOnLocalD1, runToolInRepo } from "../integration/local-d1-handler-env";
import { releaseSectionWithTwoSubTasks } from "../fixtures/handlerRows";
import { firstOf } from "./elements";
import { jsonObject, readJson } from "./readJson";
import { apiEnv } from "./apiEnv";
import { optionalRecordIn, recordIn, type McpRecord } from "./mcpResponses";
import type { StoredRow } from "./d1Doubles";
import type { Env } from "@functions/api/types";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const migrationsDir = path.join(repoRoot, "db/migrations");
export const migration25 = "0025_add_personal_run_keys.sql";
export const migration27 = "0027_add_personal_run_key_permissions.sql";
const protocolVersion = "2025-06-18";

type TestEnv = {
  DB: D1Database;
  PERSONAL_RUN_MCP_ENABLED?: "true" | "false";
};

export type JsonRecord = Record<string, unknown>;

let platform: PlatformProxy<TestEnv> | undefined;
export let env: Env;
let persistPath = "";
export let rawKey = "";
export const keyId = "key-user-a";

export function sendRequestsWithRunKey(key: string): void {
  rawKey = key;
}

function migrationNamesThrough24(): string[] {
  return readdirSync(migrationsDir)
    .filter((name) => name.endsWith(".sql") && name !== migration25 && name !== migration27)
    .sort((left, right) => left.localeCompare(right));
}

export async function applyMigration(name: string): Promise<void> {
  const statements = readFileSync(path.join(migrationsDir, name), "utf8")
    .split(";")
    .map((statement) => statement.trim())
    .filter(Boolean);
  for (const statement of statements) await env.DB.prepare(statement).run();
}

export async function rows<T extends JsonRecord = StoredRow>(sql: string, ...bindings: unknown[]): Promise<T[]> {
  const result = await env.DB.prepare(sql).bind(...bindings).all<T>();
  return result.results;
}

export function mcpRequest(method: string, params?: unknown, id: number | undefined = 1, path = "/api/mcp", key = rawKey): Request {
  return new Request(`http://localhost${path}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      Accept: "application/json, text/event-stream",
      "Content-Type": "application/json; charset=utf-8",
      "MCP-Protocol-Version": protocolVersion,
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      ...(id === undefined ? {} : { id }),
      method,
      ...(params === undefined ? {} : { params }),
    }),
  });
}

export async function callTool(name: string, args: JsonRecord = {}, id = 1): Promise<Response> {
  return handleAgentMcp(mcpRequest("tools/call", { name, arguments: args }, id), env);
}

export async function bodyOf(response: Response): Promise<McpRecord> {
  return recordIn(await readJson(response, jsonObject));
}

const toolResultBody = z.object({ result: z.object({ structuredContent: z.unknown() }).passthrough() }).passthrough();

export function toolPayload(body: unknown): McpRecord {
  return optionalRecordIn(toolResultBody.parse(body).result.structuredContent) ?? {};
}

export function toolError(body: JsonRecord): string | undefined {
  const { error } = toolPayload(body);
  return typeof error === "string" ? error : undefined;
}

export const byteLength = (value: unknown) => new TextEncoder().encode(JSON.stringify(value)).byteLength;

const PROSE = "Confirm the owner, the rollback plan, and the customer notice — then record it. Überprüfen. 🚀 ";
const PROSE_CHARACTERS = Array.from(PROSE);
const proseOfWholeCharacters = (characterCount: number) =>
  Array.from({ length: characterCount }, (_, index) => PROSE_CHARACTERS[index % PROSE_CHARACTERS.length]).join("");
export const notesWithinUtf16Units = (unitCount: number) => {
  let units = 0;
  return Array.from(proseOfWholeCharacters(unitCount)).filter((character) => (units += character.length) <= unitCount).join("");
};
const textTask = (id: string, textLength: number) => ({
  id,
  title: `Task ${id}`,
  description: `Why ${id} matters`,
  contents: [{ id: `${id}-text`, type: "text", value: proseOfWholeCharacters(textLength) }],
});

export function sectionsAbout1KbUnderTheTemplateLimit(): JsonRecord[] {
  const longTaskReadInParts = textTask("guide-long", 90_000);
  const guide = { id: "guide", title: "Guide", items: [textTask("guide-intro", 400), longTaskReadInParts] };
  const checksOf130TasksReadInPages = { id: "checks", title: "Checks", items: Array.from({ length: 130 }, (_, index) => textTask(`check-${index}`, 520)) };
  const sections: JsonRecord[] = [guide, checksOf130TasksReadInPages];
  for (let index = 0; sections.length < 24; index += 1) {
    const areaReadWhole = {
      id: `area-${index}`,
      title: `Area ${index}`,
      items: Array.from({ length: 16 }, (_, task) => textTask(`area-${index}-${task}`, 1_350)),
    };
    sections.push(areaReadWhole);
  }
  const longTaskText = firstOf(longTaskReadInParts.contents);
  const bytesPerCharacter = new TextEncoder().encode(PROSE).byteLength / PROSE_CHARACTERS.length;
  const roomToGrowUntilAbout1KbUnderTheLimit = TEMPLATE_CONTENT_MAX_BYTES - 1_000 - contentSaveBytes(sections);
  longTaskText.value = proseOfWholeCharacters(
    Array.from(longTaskText.value).length + Math.floor(roomToGrowUntilAbout1KbUnderTheLimit / bytesPerCharacter),
  );
  return sections;
}

async function seedPreMigrationData(): Promise<void> {
  const userSql = `
    INSERT INTO users (id, email, name, email_verified, created_at)
    VALUES (?, ?, ?, 1, ?)
  `;
  const createdAt = "2026-09-19T00:00:00.000Z";
  await env.DB.batch([
    env.DB.prepare(userSql).bind("user-a", "user-a@example.test", "User A", createdAt),
    env.DB.prepare(userSql).bind("user-b", "user-b@example.test", "User B", createdAt),
    env.DB.prepare(`
      INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).bind("team-a", "Team A", "team-a", "user-a", "user-a", createdAt, createdAt),
    env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, description, items, is_public, category, tags, created_at,
        version, type, owner_type, team_id, created_by_user_id, content_version
      ) VALUES (?, ?, ?, ?, ?, 0, ?, ?, ?, 1, 'checklist', ?, ?, ?, 1)
    `).bind(
      "template-a",
      "user-a",
      "Personal Release SOP",
      "A personal SOP",
      JSON.stringify(releaseSectionWithTwoSubTasks({ title: "Verify release", notes: "" })),
      "release",
      "[]",
      createdAt,
      "user",
      null,
      "user-a",
    ),
    env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES (?, ?, ?, '[]', 0, ?, 1, 'checklist', 'user', NULL, ?, 1)
    `).bind("template-b", "user-b", "Other user's SOP", createdAt, "user-b"),
    env.DB.prepare(`
      INSERT INTO templates (
        id, user_id, title, items, is_public, created_at, version, type, owner_type,
        team_id, created_by_user_id, content_version
      ) VALUES (?, ?, ?, '[]', 0, ?, 1, 'checklist', 'team', ?, ?, 1)
    `).bind("template-team", "user-a", "Team SOP", createdAt, "team-a", "user-a"),
    env.DB.prepare(`
      INSERT INTO checklist_runs (
        id, user_id, title, items, status, started_at, created_at, progress,
        team_id, created_by_user_id, started_by_user_id, template_version, revision, retired_items
      ) VALUES (?, ?, ?, '[]', 'in_progress', ?, ?, 0, NULL, ?, ?, 1, 1, '[]')
    `).bind("sentinel-run", "user-b", "Existing run", createdAt, createdAt, "user-b", "user-b"),
  ]);
}

async function startLocalD1Holding(migrationNames: string[]): Promise<void> {
  persistPath = mkdtempSync(path.join(tmpdir(), "serplists-personal-run-mcp-"));
  const migrationsSqlPath = path.join(persistPath, "migrations.sql");
  writeFileSync(
    migrationsSqlPath,
    migrationNames
      .map((name) => readFileSync(path.join(migrationsDir, name), "utf8"))
      .join("\n"),
  );
  runToolInRepo("wrangler", ["d1", "execute", "serp-checklists-db", "--local", "--persist-to", persistPath, "--file", migrationsSqlPath]);
  platform = await platformProxyOnLocalD1<TestEnv>(persistPath);
  env = apiEnv({ DB: platform.env.DB, PERSONAL_RUN_MCP_ENABLED: "true" });
  await seedPreMigrationData();
}

export function startLocalD1BeforeTheRunKeyMigrations(): Promise<void> {
  return startLocalD1Holding(migrationNamesThrough24());
}

export async function startLocalD1WithARunKeyForUserA(): Promise<void> {
  await startLocalD1Holding([...migrationNamesThrough24(), migration25, migration27]);
  const secret = await createPersonalRunKeySecret();
  sendRequestsWithRunKey(secret.key);
  await env.DB
    .prepare("INSERT INTO personal_run_keys (id, user_id, name, key_prefix, key_hash, created_at) VALUES (?, 'user-a', 'Codex local D1', ?, ?, ?)")
    .bind(keyId, secret.keyPrefix, secret.keyHash, "2026-09-19T02:00:00.000Z")
    .run();
}

export async function stopLocalD1(): Promise<void> {
  await platform?.dispose();
  if (persistPath) rmSync(persistPath, { recursive: true, force: true });
}
