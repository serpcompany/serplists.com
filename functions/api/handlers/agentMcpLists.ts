import { and, desc, eq, isNotNull, isNull, sql } from "drizzle-orm";
import { z } from "zod";
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
} from "./agentMcpPages";
import { summarizeRun } from "./agentMcpRuns";
import { listTemplatesArgs } from "./agentMcpTemplateTools";
import { listRunsArgs, parseToolArguments, type JsonRecord } from "./agentMcpTools";

// list_templates and list_runs: the key owner's active Personal templates and runs, newest
// first, a page at a time. A page holds as many summaries as fit in MAX_RESULT_BYTES, from at
// most LIST_PAGE_ROWS rows. nextCursor holds the sort key and id of the last row the page used,
// and the next page reads from just after it (keyset paging; never OFFSET, which reads every row
// it skips: docs/design-docs/d1-cost.md). Each page reads the owner's rows through the owner
// index and sorts them, as the single unpaged list did.

export const LIST_PAGE_ROWS = 100;
// Room a page keeps for its nextCursor: a sort key, an id, and base64's third.
const LIST_CURSOR_RESERVE_BYTES = 512;

const listCursorSchema = z.object({
  l: z.enum(["templates", "runs"]), // the list it continues
  st: z.enum(["in_progress", "completed"]).optional(), // list_runs' status filter
  k: z.string(), // the sort key of the last row the page used
  i: z.string(), // that row's id, which orders rows with the same key
}).strict();

type ListCursor = z.infer<typeof listCursorSchema>;
type After = { key: string; id: string };

const keyAfter = (sortKey: unknown, id: unknown, after: After) =>
  sql`(${sortKey} < ${after.key} or (${sortKey} = ${after.key} and ${id} < ${after.id}))`;

// A Template's updated_at stays NULL until its first edit, and SQLite sorts NULL last, so
// templates order by last change (edit, else creation). The id makes ties stable.
const templateSortKey = sql`coalesce(${schema.templates.updated_at}, ${schema.templates.created_at})`;

/** The query for a page of the owner's active Personal templates, newest change first. */
export function selectTemplatePage(db: ReturnType<typeof createDb>, userId: string, after: After | undefined, limit: number) {
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

/** The query for a page of the owner's active Personal runs, newest first. */
export function selectRunPage(
  db: ReturnType<typeof createDb>,
  userId: string,
  status: "in_progress" | "completed" | undefined,
  after: After | undefined,
  limit: number,
) {
  const runs = schema.checklist_runs;
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
  // The page's LIST_PAGE_ROWS rows and one more, when there is one.
  rows: Row[];
  owned: (row: Row) => boolean;
  summarize: (row: Row) => JsonRecord;
  cursor: (row: Row) => ListCursor;
};

// The page's summaries, as many as fit, and the cursor after the last row it used.
function listPage<Row>({ name, rows, owned, summarize, cursor }: Listing<Row>): JsonRecord {
  const candidates = rows.slice(0, LIST_PAGE_ROWS);
  const page: JsonRecord[] = [];
  let used = byteSize({ [name]: [] }) + LIST_CURSOR_RESERVE_BYTES;
  let consumed = 0;
  for (const row of candidates) {
    // The query already keeps to the owner's rows; checked again, as every MCP read does.
    if (owned(row)) {
      const summary = summarize(row);
      const bytes = byteSize(summary) + 1;
      if (used + bytes > MAX_RESULT_BYTES) break;
      page.push(summary);
      used += bytes;
    }
    consumed += 1;
  }
  const more = consumed < candidates.length || rows.length > LIST_PAGE_ROWS;
  if (more && consumed === 0) throw resultTooLarge();
  return bounded({ [name]: page, ...(more ? { nextCursor: encodeCursor(cursor(candidates[consumed - 1])) } : {}) });
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
  const rows = await selectTemplatePage(createDb(env), identity.userId, after, LIST_PAGE_ROWS + 1);
  return listPage({
    name: "templates",
    rows,
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
  // A cursor carries the status filter of the list it continues; a status passed with it must match.
  if (cursor && args.status !== undefined && args.status !== cursor.st) {
    throw invalidCursor("It continues a list of runs with another status");
  }
  const status = cursor ? cursor.st : args.status;
  const rows = await selectRunPage(createDb(env), identity.userId, status, afterOf(cursor), LIST_PAGE_ROWS + 1);
  return listPage({
    name: "runs",
    rows,
    owned: (row) => row.user_id === identity.userId && row.team_id === null && row.deleted_at === null,
    summarize: (row) => ({ ...summarizeRun(row as JsonRecord), title: boundedText(row.title) }),
    cursor: (row) => ({ l: "runs", ...(status ? { st: status } : {}), k: row.created_at, i: String(row.id) }),
  });
}

/** The line a list's result starts its text with, for clients that show text. */
export function describeList(result: JsonRecord, noun: "template" | "run"): string {
  const count = Array.isArray(result[`${noun}s`]) ? (result[`${noun}s`] as unknown[]).length : 0;
  const more = typeof result.nextCursor === "string" ? ` More follows: call list_${noun}s with cursor set to nextCursor.` : "";
  return `Found ${count} personal ${noun}(s).${more}`;
}
