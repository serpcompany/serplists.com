import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import type { JsonRecord } from "../../../src/lib/schemas/jsonRecords";
import { createDb, schema } from "../db";
import type { Env } from "../types";
import type { PersonalRunKeyIdentity } from "../utils/personal-run-key";
import {
  bounded,
  boundedText,
  byteSize,
  decodeCursor,
  encodeCursor,
  invalidCursor,
  MAX_RESULT_BYTES,
  resultTooLarge,
  type ToolResult,
} from "./agentMcpPages";
import { summarizeRun } from "./agentMcpRuns";
import { listTemplatesArgs } from "./agentMcpTemplateTools";
import { listRunsArgs, parseToolArguments } from "./agentMcpTools";

export const LIST_PAGE_ROWS = 100;
const LIST_CURSOR_RESERVE_BYTES = 512;

const listCursorSchema = z.object({
  l: z.enum(["templates", "runs"]),
  st: z.enum(["in_progress", "completed"]).optional(),
  k: z.string(),
  i: z.string(),
}).strict();

type ListCursor = z.infer<typeof listCursorSchema>;
type After = { key: string; id: string };

const keyAfter = (sortKey: unknown, id: unknown, after: After) =>
  sql`(${sortKey} < ${after.key} or (${sortKey} = ${after.key} and ${id} < ${after.id}))`;

const templateSortKey = sql`coalesce(${schema.templates.updated_at}, ${schema.templates.created_at})`;

function selectTemplatePage(db: ReturnType<typeof createDb>, userId: string, after: After | undefined, limit: number) {
  const { templates } = schema;
  return db
    .select({
      id: templates.id,
      user_id: templates.user_id,
      owner_type: templates.owner_type,
      team_id: templates.team_id,
      deleted_at: templates.deleted_at,
      title: templates.title,
      description: templates.description,
      type: templates.type,
      content_version: templates.content_version,
      created_at: templates.created_at,
      updated_at: templates.updated_at,
    })
    .from(templates)
    .where(and(
      eq(templates.user_id, userId),
      eq(templates.owner_type, "user"),
      isNull(templates.team_id),
      isNull(templates.deleted_at),
      isNotNull(templates.id),
      after ? keyAfter(templateSortKey, templates.id, after) : undefined,
    ))
    .orderBy(desc(templateSortKey), desc(templates.id))
    .limit(limit);
}

function selectRunPage(
  db: ReturnType<typeof createDb>,
  userId: string,
  status: "in_progress" | "completed" | undefined,
  after: After | undefined,
  limit: number,
) {
  const runs = schema.checklistRuns;
  return db
    .select({
      id: runs.id,
      user_id: runs.user_id,
      team_id: runs.team_id,
      deleted_at: runs.deleted_at,
      template_id: runs.template_id,
      title: runs.title,
      status: runs.status,
      progress: runs.progress,
      revision: runs.revision,
      template_version: runs.template_version,
      started_at: runs.started_at,
      completed_at: runs.completed_at,
      created_at: runs.created_at,
      updated_at: runs.updated_at,
    })
    .from(runs)
    .where(and(
      eq(runs.user_id, userId),
      isNull(runs.team_id),
      isNull(runs.deleted_at),
      isNotNull(runs.id),
      status ? eq(runs.status, status) : undefined,
      after ? keyAfter(runs.created_at, runs.id, after) : undefined,
    ))
    .orderBy(desc(runs.created_at), desc(runs.id))
    .limit(limit);
}

type Listing<Row> = {
  name: "templates" | "runs";
  rowsAndOneMore: Row[];
  owned: (row: Row) => boolean;
  summarize: (row: Row) => JsonRecord;
  cursor: (row: Row) => ListCursor;
};

function listPage<Row>({ name, rowsAndOneMore, owned, summarize, cursor }: Listing<Row>): JsonRecord {
  const candidates = rowsAndOneMore.slice(0, LIST_PAGE_ROWS);
  const page: JsonRecord[] = [];
  let used = byteSize({ [name]: [] }) + LIST_CURSOR_RESERVE_BYTES;
  let consumed = 0;
  for (const row of candidates) {
    if (owned(row)) {
      const summary = summarize(row);
      const bytes = byteSize(summary) + 1;
      if (used + bytes > MAX_RESULT_BYTES) break;
      page.push(summary);
      used += bytes;
    }
    consumed += 1;
  }
  const more = consumed < candidates.length || rowsAndOneMore.length > LIST_PAGE_ROWS;
  if (more && consumed === 0) throw resultTooLarge();
  const lastConsumed = more ? candidates[consumed - 1] : undefined;
  return bounded({ [name]: page, ...(lastConsumed === undefined ? {} : { nextCursor: encodeCursor(cursor(lastConsumed)) }) });
}

function readListCursor(value: string | undefined, list: ListCursor["l"]): ListCursor | undefined {
  if (value === undefined) return undefined;
  const tool = `list_${list}`;
  const cursor = decodeCursor(value, listCursorSchema, tool);
  if (cursor.l !== list) throw invalidCursor(`Not a cursor ${tool} returned`);
  return cursor;
}

const afterOf = (cursor: ListCursor | undefined): After | undefined => (cursor ? { key: cursor.k, id: cursor.i } : undefined);

export async function listTemplates(env: Env, identity: PersonalRunKeyIdentity, rawArguments: unknown): Promise<JsonRecord> {
  const args = parseToolArguments(listTemplatesArgs, rawArguments);
  const after = afterOf(readListCursor(args.cursor, "templates"));
  const rowsAndOneMore = await selectTemplatePage(createDb(env), identity.userId, after, LIST_PAGE_ROWS + 1);
  return listPage({
    name: "templates",
    rowsAndOneMore,
    owned: (row) => row.user_id === identity.userId && row.owner_type === "user" && row.team_id === null && row.deleted_at === null,
    summarize: (row) => ({
      id: row.id,
      title: boundedText(row.title),
      description: typeof row.description === "string" ? boundedText(row.description, 500) : row.description,
      type: row.type,
      contentVersion: row.content_version,
      createdAt: row.created_at,
      updatedAt: row.updated_at,
    }),
    cursor: (row) => ({ l: "templates", k: row.updated_at ?? row.created_at, i: String(row.id) }),
  });
}

export async function listRuns(env: Env, identity: PersonalRunKeyIdentity, rawArguments: unknown): Promise<JsonRecord> {
  const args = parseToolArguments(listRunsArgs, rawArguments);
  const cursor = readListCursor(args.cursor, "runs");
  if (cursor && args.status !== undefined && args.status !== cursor.st) {
    throw invalidCursor("It continues a list of runs with another status");
  }
  const status = cursor ? cursor.st : args.status;
  const rowsAndOneMore = await selectRunPage(createDb(env), identity.userId, status, afterOf(cursor), LIST_PAGE_ROWS + 1);
  return listPage({
    name: "runs",
    rowsAndOneMore,
    owned: (row) => row.user_id === identity.userId && row.team_id === null && row.deleted_at === null,
    summarize: (row) => ({ ...summarizeRun(row), title: boundedText(row.title) }),
    cursor: (row) => ({ l: "runs", ...(status ? { st: status } : {}), k: row.created_at, i: String(row.id) }),
  });
}

export function describeList(result: ToolResult, noun: "template" | "run"): string {
  const listed = result[`${noun}s`];
  const count = Array.isArray(listed) ? listed.length : 0;
  const more = typeof result.nextCursor === "string" ? ` More follows: call list_${noun}s with cursor set to nextCursor.` : "";
  return `Found ${count} personal ${noun}(s).${more}`;
}
