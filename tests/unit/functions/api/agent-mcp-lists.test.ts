import { beforeEach, describe, expect, it, vi } from "vitest";

import { SqliteD1 } from "../../../support/sqlite-d1";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { LIST_PAGE_ROWS } from "@functions/api/handlers/agentMcpLists";
import { MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import { authenticateWithAFreshRunKey, mcpToolCall, resultBytes } from "../../../support/agentMcp";
import { costliestJsonText } from "../../../support/jsonText";

type JsonRecord = Record<string, unknown>;

let d1: SqliteD1;
let requestId = 0;

async function call(name: string, args: JsonRecord = {}): Promise<{ result: JsonRecord; error?: JsonRecord }> {
  requestId += 1;
  authenticateWithAFreshRunKey(authenticatePersonalRunKey);
  const response = await handleAgentMcp(mcpToolCall(name, args, requestId), { DB: d1.binding } as never);
  const body = await response.json() as JsonRecord;
  return { result: body.result as JsonRecord, error: body.error as JsonRecord | undefined };
}

async function everyPageWithinTheBound(name: "list_templates" | "list_runs", args: JsonRecord = {}): Promise<JsonRecord[]> {
  const pages: JsonRecord[] = [];
  let cursor: string | undefined;
  do {
    const { result, error } = await call(name, { ...args, ...(cursor ? { cursor } : {}) });
    expect(error).toBeUndefined();
    expect(result.isError).toBeUndefined();
    const page = result.structuredContent as JsonRecord;
    expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    pages.push(page);
    cursor = page.nextCursor as string | undefined;
  } while (cursor);
  return pages;
}

const CREATED = "2026-01-01T00:00:00.000Z";
const timestamp = (index: number) => `2026-0${1 + (index % 9)}-${String(1 + (index % 28)).padStart(2, "0")}T00:00:00.000Z`;

function seedUsers() {
  for (const id of ["user-1", "user-2"]) {
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES (?, ?, ?, 1, ?)", id, `${id}@example.test`, id, CREATED);
  }
  d1.run(`INSERT INTO teams (id, name, slug, billing_owner_user_id, created_by_user_id, created_at, updated_at)
    VALUES ('team-1', 'Team', 'team', 'user-1', 'user-1', ?, ?)`, CREATED, CREATED);
}

function insertTemplate(id: string, fields: { userId?: string; createdAt: string; updatedAt?: string | null; title?: string; description?: string | null; team?: boolean; deleted?: boolean }) {
  d1.run(`INSERT INTO templates (id, user_id, title, description, items, is_public, created_at, updated_at, version, type,
      owner_type, team_id, created_by_user_id, content_version, deleted_at)
    VALUES (?, ?, ?, ?, '[]', 0, ?, ?, 1, 'checklist', ?, ?, ?, 1, ?)`,
  id, fields.userId ?? "user-1", fields.title ?? `SOP ${id}`, fields.description ?? null, fields.createdAt, fields.updatedAt ?? null,
  fields.team ? "team" : "user", fields.team ? "team-1" : null, fields.userId ?? "user-1", fields.deleted ? CREATED : null);
}

function insertRun(id: string, fields: { userId?: string; createdAt: string; status?: string; title?: string; team?: boolean; deleted?: boolean }) {
  d1.run(`INSERT INTO checklist_runs (id, user_id, title, items, status, started_at, created_at, progress, team_id,
      created_by_user_id, started_by_user_id, template_version, revision, retired_items, deleted_at)
    VALUES (?, ?, ?, '[]', ?, ?, ?, 0, ?, ?, ?, 1, 3, '[]', ?)`,
  id, fields.userId ?? "user-1", fields.title ?? `Run ${id}`, fields.status ?? "in_progress", fields.createdAt, fields.createdAt,
  fields.team ? "team-1" : null, fields.userId ?? "user-1", fields.userId ?? "user-1", fields.deleted ? CREATED : null);
}

describe("MCP list tools on the migrated tables", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
    d1 = new SqliteD1();
    seedUsers();
  });

  describe("list_templates", () => {
    function seedTemplatesNeverListed() {
      insertTemplate("archived", { createdAt: "2027-01-01T00:00:00.000Z", deleted: true });
      insertTemplate("organization", { createdAt: "2027-01-01T00:00:00.000Z", team: true });
      insertTemplate("other-user", { userId: "user-2", createdAt: "2027-01-01T00:00:00.000Z" });
    }

    function seedTemplatesReturningTheListedOrder(): string[] {
      const expected: Array<{ id: string; key: string }> = [];
      for (let index = 0; index < 260; index += 1) {
        const id = `t-${String(index).padStart(3, "0")}`;
        const edited = index % 3 === 0;
        const createdAt = timestamp(index);
        const updatedAt = edited ? timestamp(index + 5) : null;
        const costliest = index % 5 === 0;
        insertTemplate(id, {
          createdAt,
          updatedAt,
          title: costliest ? costliestJsonText(400) : `SOP ${index}`,
          description: costliest ? costliestJsonText(5_000) : "How we ship",
        });
        expected.push({ id, key: updatedAt ?? createdAt });
      }
      seedTemplatesNeverListed();
      return expected
        .sort((left, right) => (left.key === right.key ? right.id.localeCompare(left.id) : right.key.localeCompare(left.key)))
        .map(({ id }) => id);
    }

    it("lists every active Personal template once, newest change first, a page within the bound at a time, cutting long titles and descriptions", async () => {
      const expected = seedTemplatesReturningTheListedOrder();

      const pages = await everyPageWithinTheBound("list_templates");

      const listed = pages.flatMap((page) => (page.templates as JsonRecord[]).map(({ id }) => id));
      expect(listed).toEqual(expected);
      expect(pages.length).toBeGreaterThan(3);
      expect(pages.at(-1)).not.toHaveProperty("nextCursor");
      expect(pages.slice(0, -1).every((page) => typeof page.nextCursor === "string")).toBe(true);
      const costliest = pages.flatMap((page) => page.templates as JsonRecord[]).find(({ id }) => id === "t-000") as JsonRecord;
      expect(String(costliest.title)).toHaveLength(160);
      expect(String(costliest.description)).toHaveLength(500);
      expect(pages[0].templates).toEqual(expect.arrayContaining([
        expect.objectContaining({ type: "checklist", contentVersion: 1, createdAt: expect.any(String) }),
      ]));
    });

    it("reads a page from the owner index, stopping at the page's rows and never reading content", async () => {
      seedTemplatesReturningTheListedOrder();
      d1.queries.length = 0;

      await call("list_templates");

      const query = d1.queries.find(({ sql }) => /from "templates"/.test(sql) && /order by/i.test(sql));
      expect(query?.params.at(-1)).toBe(LIST_PAGE_ROWS + 1);
      const plan = d1.queryPlan(query as never).join("; ");
      expect(plan).toContain("idx_templates_owner");
      expect(plan).not.toMatch(/SCAN templates\b/);
      expect(query?.sql).not.toMatch(/"items"/);
    });

    it("never repeats a template that is edited while the list is read", async () => {
      seedTemplatesReturningTheListedOrder();
      const first = (await call("list_templates")).result.structuredContent as JsonRecord;
      const firstIds = (first.templates as JsonRecord[]).map(({ id }) => id);
      d1.run("UPDATE templates SET updated_at = '2027-06-01T00:00:00.000Z' WHERE id = ?", firstIds[1]);

      const rest: unknown[] = [];
      let cursor = first.nextCursor as string | undefined;
      while (cursor) {
        const page = (await call("list_templates", { cursor })).result.structuredContent as JsonRecord;
        rest.push(...(page.templates as JsonRecord[]).map(({ id }) => id));
        cursor = page.nextCursor as string | undefined;
      }
      expect(rest).not.toContain(firstIds[1]);
      expect(new Set([...firstIds, ...rest]).size).toBe(firstIds.length + rest.length);
    });

    it("returns one page without a cursor for a short list", async () => {
      insertTemplate("only", { createdAt: CREATED });

      const pages = await everyPageWithinTheBound("list_templates");

      expect(pages).toEqual([{ templates: [expect.objectContaining({ id: "only", title: "SOP only" })] }]);
    });
  });

  describe("list_runs", () => {
    function seedRuns(): { all: string[]; completed: string[] } {
      const runs: Array<{ id: string; createdAt: string; status: string }> = [];
      for (let index = 0; index < 240; index += 1) {
        const id = `r-${String(index).padStart(3, "0")}`;
        const status = index % 4 === 0 ? "completed" : "in_progress";
        const createdAt = timestamp(index);
        insertRun(id, { createdAt, status, title: index % 3 === 0 ? costliestJsonText(400) : `Run ${index}` });
        runs.push({ id, createdAt, status });
      }
      insertRun("archived", { createdAt: "2027-01-01T00:00:00.000Z", deleted: true });
      insertRun("organization", { createdAt: "2027-01-01T00:00:00.000Z", team: true });
      insertRun("other-user", { userId: "user-2", createdAt: "2027-01-01T00:00:00.000Z" });
      const order = [...runs].sort((left, right) =>
        (left.createdAt === right.createdAt ? right.id.localeCompare(left.id) : right.createdAt.localeCompare(left.createdAt)));
      return {
        all: order.map(({ id }) => id),
        completed: order.filter(({ status }) => status === "completed").map(({ id }) => id),
      };
    }

    it("lists every active Personal run once, newest first, a page within the bound at a time", async () => {
      const { all } = seedRuns();

      const pages = await everyPageWithinTheBound("list_runs");

      const runs = pages.flatMap((page) => page.runs as JsonRecord[]);
      expect(runs.map(({ id }) => id)).toEqual(all);
      expect(pages.length).toBeGreaterThan(3);
      expect(runs[0]).not.toHaveProperty("sections");
      expect(runs[0]).not.toHaveProperty("retiredItems");
      expect(runs.find(({ id }) => id === "r-000")).toEqual(expect.objectContaining({ revision: 3, status: "completed", progress: 0 }));
      expect(String(runs.find(({ id }) => id === "r-000")?.title)).toHaveLength(160);
    });

    it("keeps the status filter in its cursor, so a continuation may leave it out or repeat it", async () => {
      const { completed } = seedRuns();

      const pages = await everyPageWithinTheBound("list_runs", { status: "completed" });
      expect(pages.flatMap((page) => (page.runs as JsonRecord[]).map(({ id }) => id))).toEqual(completed);

      const first = (await call("list_runs", { status: "completed" })).result.structuredContent as JsonRecord;
      const continuedWithoutStatus = (await call("list_runs", { cursor: first.nextCursor })).result.structuredContent as JsonRecord;
      const continuedWithSameStatus = (await call("list_runs", { cursor: first.nextCursor, status: "completed" })).result.structuredContent as JsonRecord;
      expect(continuedWithoutStatus).toEqual(continuedWithSameStatus);
      expect((continuedWithoutStatus.runs as JsonRecord[]).every(({ status }) => status === "completed")).toBe(true);
    });

    it("reads a page from the user index, stopping at the page's rows and never reading content", async () => {
      seedRuns();
      d1.queries.length = 0;

      await call("list_runs", { status: "in_progress" });

      const query = d1.queries.find(({ sql }) => /from "checklist_runs"/.test(sql) && /order by/i.test(sql));
      expect(query?.params.at(-1)).toBe(LIST_PAGE_ROWS + 1);
      const plan = d1.queryPlan(query as never).join("; ");
      expect(plan).toContain("idx_checklist_runs_user_id");
      expect(plan).not.toMatch(/SCAN checklist_runs\b/);
      expect(query?.sql).not.toMatch(/"items"|"retired_items"/);
    });
  });

  describe("cursors", () => {
    beforeEach(() => {
      for (let index = 0; index < 150; index += 1) {
        insertTemplate(`t-${index}`, { createdAt: timestamp(index), title: costliestJsonText(200) });
        insertRun(`r-${index}`, { createdAt: timestamp(index), title: costliestJsonText(200), status: index % 2 ? "completed" : "in_progress" });
      }
    });

    it.each([
      ["a value no list returned", "list_templates", () => "bm90LWEtY3Vyc29y"],
      ["a list_runs cursor", "list_templates", async () => ((await call("list_runs")).result.structuredContent as JsonRecord).nextCursor],
      ["a list_templates cursor", "list_runs", async () => ((await call("list_templates")).result.structuredContent as JsonRecord).nextCursor],
      ["a get_template cursor shape", "list_runs", () => Buffer.from(JSON.stringify({ t: "x", v: 1, m: "outline", u: 1, o: 0 })).toString("base64url")],
    ])("refuses %s as invalid arguments", async (_label, tool, cursorOf) => {
      const cursor = await cursorOf();
      expect(typeof cursor).toBe("string");

      const { error } = await call(tool, { cursor });

      expect(error).toMatchObject({ code: -32602, data: { code: "invalid_arguments" } });
      expect(String(error?.message)).toMatch(/^cursor: Not a cursor list_(templates|runs) returned$/);
    });

    it("refuses a status other than the one its cursor continues", async () => {
      const first = (await call("list_runs", { status: "completed" })).result.structuredContent as JsonRecord;

      const { error } = await call("list_runs", { status: "in_progress", cursor: first.nextCursor });

      expect(error).toMatchObject({ data: { code: "invalid_arguments" } });
      expect(String(error?.message)).toBe("cursor: It continues a list of runs with another status");
    });

    it("refuses arguments list_templates does not take", async () => {
      const { error } = await call("list_templates", { status: "completed" });

      expect(error).toMatchObject({ data: { code: "invalid_arguments" } });
    });
  });
});
