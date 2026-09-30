import { beforeEach, describe, expect, it, vi } from "vitest";

import { SqliteD1 } from "../../../support/sqlite-d1";

// Every tool the MCP advertises, driven through the endpoint on every migration with what the
// schemas allow at their largest: every result it returns stays within MAX_RESULT_BYTES, which
// MCP clients take whole. A new tool fails the first test until it has a case here.

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import { toolDefinitions } from "@functions/api/handlers/agentMcpTools";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  TEMPLATE_CONTENT_MAX_BYTES,
} from "@/lib/schemas/contentLimits";
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_LIST_ITEM_MAX, TEMPLATE_LIST_MAX_ITEMS, TEMPLATE_TITLE_MAX } from "@/lib/schemas/templateLimits";
import { readRunInFull } from "../../../support/runPages";
import { readTemplateInFull } from "../../../support/templatePages";

type JsonRecord = Record<string, unknown>;

const identity = {
  keyId: "key-1",
  userId: "user-1",
  name: "Codex",
  permissions: ["templates:read", "templates:write", "runs:read", "runs:write"] as const,
};
const NOW = "2026-09-30T00:00:00.000Z";

let d1: SqliteD1;
let calls = 0;

async function call(name: string, args: JsonRecord): Promise<JsonRecord> {
  calls += 1;
  // A key of its own per call keeps long reads under the per-key request limit.
  vi.mocked(authenticatePersonalRunKey).mockResolvedValue({ ...identity, keyId: `bounds-${calls}` });
  const response = await handleAgentMcp(new Request("http://localhost/api/mcp", {
    method: "POST",
    headers: {
      Authorization: "Bearer test",
      "Content-Type": "application/json",
      Accept: "application/json, text/event-stream",
      "MCP-Protocol-Version": "2025-06-18",
    },
    body: JSON.stringify({ jsonrpc: "2.0", id: calls, method: "tools/call", params: { name, arguments: args } }),
  }), { DB: d1.binding } as never);
  const body = await response.json() as JsonRecord;
  expect(body.error, name).toBeUndefined();
  const result = body.result as JsonRecord;
  expect(result.isError, `${name}: ${toJson(result.structuredContent).slice(0, 300)}`).toBeUndefined();
  return result.structuredContent as JsonRecord;
}

const resultBytes = (value: unknown) => new TextEncoder().encode(toJson(value)).byteLength;

// The characters that cost the most JSON bytes: a control character is a 6-byte escape.
const costly = (length: number) => "\u0001".repeat(length);
// Prose with two-, three- and four-byte characters.
const PROSE = "Confirmed the owner, the rollback plan, and the customer notice — then recorded it. Überprüfen. 界 🚀 ";
const prose = (length: number) => Array.from({ length: Math.ceil(length / PROSE.length) }, () => PROSE).join("").slice(0, length);

const task = (id: string, textLength: number) => ({
  id,
  title: `Task ${id}`,
  description: `Why ${id} matters`,
  contents: [
    { id: `${id}-text`, type: "text", value: prose(textLength) },
    { id: `${id}-subs`, type: "subItems", value: "", subItems: [{ id: `${id}-sub`, title: "Checked twice" }] },
  ],
});

// Sections whose content is just under the template limit (in at most the 100 sections
// create_template takes), one of them a task too large for a result on its own.
function maximumTemplateSections(): JsonRecord[] {
  const sections: JsonRecord[] = [{ id: "s0", title: costly(TEMPLATE_TITLE_MAX), items: [task("big", 100_000)] }];
  for (let index = 1; contentSaveBytes(sections) < TEMPLATE_CONTENT_MAX_BYTES - 16_000; index += 1) {
    sections.push({ id: `s${index}`, title: `Section ${index}`, items: Array.from({ length: 10 }, (_, t) => task(`s${index}-t${t}`, 500)) });
  }
  expect(sections.length).toBeLessThanOrEqual(100);
  // PROSE takes about 1.06 bytes a character.
  const last = ((sections.at(-1)?.items as JsonRecord[])[0].contents as JsonRecord[])[0];
  last.value = prose(String(last.value).length + Math.floor((TEMPLATE_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(sections)) / 1.1));
  expect(contentSaveBytes(sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
  return sections;
}

// The largest fields a template's header can hold.
const maximumHeader = () => ({
  title: costly(TEMPLATE_TITLE_MAX),
  description: costly(TEMPLATE_DESCRIPTION_MAX),
  categories: Array.from({ length: TEMPLATE_LIST_MAX_ITEMS }, (_, index) => `${index}${costly(TEMPLATE_LIST_ITEM_MAX - 2)}`),
  tags: Array.from({ length: TEMPLATE_LIST_MAX_ITEMS }, (_, index) => `${index}${costly(TEMPLATE_LIST_ITEM_MAX - 2)}`),
});

function insertTemplate(id: string, sections: unknown[], fields: JsonRecord = {}) {
  d1.run(`INSERT INTO templates (id, user_id, title, description, items, is_public, category, tags, created_at, updated_at,
      version, type, owner_type, team_id, created_by_user_id, content_version)
    VALUES (?, 'user-1', ?, ?, ?, 0, ?, ?, ?, NULL, 1, 'checklist', 'user', NULL, 'user-1', 1)`,
  id, fields.title ?? `SOP ${id}`, fields.description ?? null, JSON.stringify(sections),
  JSON.stringify(fields.categories ?? []), JSON.stringify(fields.tags ?? []), fields.createdAt ?? NOW);
}

function insertRun(id: string, sections: unknown[], retired: unknown[] = [], fields: JsonRecord = {}) {
  d1.run(`INSERT INTO checklist_runs (id, user_id, template_id, title, items, status, started_at, created_at, progress, team_id,
      created_by_user_id, started_by_user_id, template_version, revision, retired_items)
    VALUES (?, 'user-1', NULL, ?, ?, 'in_progress', ?, ?, 0, NULL, 'user-1', 'user-1', 1, 1, ?)`,
  id, fields.title ?? `Run ${id}`, JSON.stringify(sections), fields.createdAt ?? NOW, fields.createdAt ?? NOW, JSON.stringify(retired));
}

// A run at the limits: content just under the run limit, with 20,000-character notes (the most
// update_run writes) and a 200,000-character note (the web app writes any length), and about 1MB
// of retired work beside it, within the 2MB a D1 row holds.
function maximumRun(): { sections: JsonRecord[]; retired: JsonRecord[] } {
  const runTask = (id: string, notes: number) => ({ ...task(id, 200), isCompleted: false, notes: prose(notes) });
  const sections: JsonRecord[] = [
    { id: "notes", title: costly(TEMPLATE_TITLE_MAX), items: Array.from({ length: 12 }, (_, index) => runTask(`note-${index}`, 20_000)) },
    { id: "huge", title: "Huge", items: [runTask("huge-note", 200_000)] },
  ];
  for (let index = 0; contentSaveBytes(sections) < RUN_CONTENT_MAX_BYTES - 40_000; index += 1) {
    sections.push({ id: `area-${index}`, title: `Area ${index}`, items: Array.from({ length: 12 }, (_, t) => runTask(`area-${index}-${t}`, 500)) });
  }
  const filler = (sections.at(-1)?.items as JsonRecord[])[0];
  filler.notes = prose(String(filler.notes).length + Math.floor((RUN_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(sections)) / 1.1));
  const retired: JsonRecord[] = [
    ...Array.from({ length: 20 }, (_, index) => ({
      kind: "section",
      section: { id: `gone-${index}`, title: `Gone ${index}`, items: Array.from({ length: 10 }, (_, t) => runTask(`gone-${index}-${t}`, 1_800)) },
    })),
    { kind: "section", section: { id: "gone-large", title: "Gone", items: [runTask("gone-large-1", 120_000)] } },
    ...Array.from({ length: 300 }, (_, index) => ({ kind: "item", sectionId: `area-${index % 10}`, item: runTask(`removed-${index}`, 700) })),
    ...Array.from({ length: 200 }, (_, index) => ({
      kind: "subItem",
      sectionId: "notes",
      itemId: `note-${index % 12}`,
      subItem: { id: `removed-sub-${index}`, title: costly(80), isCompleted: true },
    })),
  ];
  return { sections, retired };
}

// Every page of a list, following nextCursor.
async function listAll(name: "list_templates" | "list_runs"): Promise<JsonRecord[]> {
  const pages = [await call(name, {})];
  while (typeof pages.at(-1)?.nextCursor === "string") pages.push(await call(name, { cursor: pages.at(-1)?.nextCursor }));
  return pages;
}

const cases: Record<string, () => Promise<JsonRecord[]>> = {
  async list_templates() {
    // Titles and descriptions of any length, from rows stored before today's limits.
    for (let index = 0; index < 150; index += 1) {
      insertTemplate(`t-${String(index).padStart(3, "0")}`, [], { title: costly(1_000), description: costly(20_000) });
    }
    const pages = await listAll("list_templates");
    expect(pages.flatMap((page) => page.templates as unknown[])).toHaveLength(150);
    return pages;
  },

  async get_template() {
    // A template stored before the content limit (imports took up to 2MB), with the largest fields.
    const sections = [...maximumTemplateSections(), ...maximumTemplateSections().map((section) => ({ ...section, id: `old-${String(section.id)}` }))];
    insertTemplate("legacy", sections, maximumHeader());
    const { template, results } = await readTemplateInFull((args) => call("get_template", args), "legacy");
    expect(template.sections).toHaveLength(sections.length);
    return results;
  },

  async create_template() {
    const created = await call("create_template", { ...maximumHeader(), sections: maximumTemplateSections() });
    expect(created.sectionsOmitted).toBe(true);
    return [created];
  },

  async update_template() {
    const created = await call("create_template", { ...maximumHeader(), sections: maximumTemplateSections() });
    const templateId = (created.template as JsonRecord).id;
    const versionOf = (result: JsonRecord) => (result.template as JsonRecord).version;
    const results = [
      await call("update_template", { templateId, expectedVersion: 1, operation: "replace_task", taskId: "big", task: { title: "Bigger" } }),
    ];
    results.push(await call("update_template", { templateId, expectedVersion: versionOf(results[0]), title: `${costly(TEMPLATE_TITLE_MAX - 1)}!` }));
    const sections = maximumTemplateSections().reverse();
    results.push(await call("update_template", { templateId, expectedVersion: versionOf(results[1]), sections }));
    expect(results.map(versionOf)).toEqual([2, 3, 4]);
    return results;
  },

  async start_run() {
    insertTemplate("maximum", maximumTemplateSections(), maximumHeader());
    const started = await call("start_run", { templateId: "maximum" });
    expect(started.sectionsOmitted).toBe(true);
    return [started, await call("start_run", { templateId: "maximum", title: costly(TEMPLATE_TITLE_MAX) })];
  },

  async list_runs() {
    for (let index = 0; index < 150; index += 1) insertRun(`r-${String(index).padStart(3, "0")}`, [], [], { title: costly(1_000) });
    const pages = await listAll("list_runs");
    expect(pages.flatMap((page) => page.runs as unknown[])).toHaveLength(150);
    return pages;
  },

  async get_run() {
    const { sections, retired } = maximumRun();
    insertRun("maximum", sections, retired, { title: costly(1_000) });
    const { run, results } = await readRunInFull((args) => call("get_run", args), "maximum");
    expect(run.sections).toHaveLength(sections.length);
    expect(run.retiredItems).toHaveLength(retired.length);
    return results;
  },

  async update_run() {
    const { sections, retired } = maximumRun();
    // Room for one more 20,000-character note.
    (sections[0].items as JsonRecord[]).splice(0, 2);
    insertRun("maximum", sections, retired, { title: costly(1_000) });
    const base = { runId: "maximum" };
    return [
      await call("update_run", { ...base, expectedRevision: 1, operation: "set_task_completed", taskId: "huge-note", completed: true }),
      await call("update_run", { ...base, expectedRevision: 2, operation: "set_subtask_completed", taskId: "note-5", subtaskId: "note-5-sub", completed: true }),
      await call("update_run", { ...base, expectedRevision: 3, operation: "set_task_notes", taskId: "note-6", notes: prose(20_000) }),
      await call("update_run", { ...base, expectedRevision: 4, operation: "set_task_notes", taskId: "area-0-0", notes: costly(5_000) }),
      await call("update_run", { ...base, expectedRevision: 5, operation: "set_run_status", status: "in_progress" }),
    ];
  },
};

describe("the largest result of every MCP tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
    d1 = new SqliteD1();
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'user-1@example.test', 'User', 1, ?)", NOW);
    // No template or active run limit.
    d1.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', ?)", NOW);
  });

  it("has a case for every tool", () => {
    expect(Object.keys(cases).sort()).toEqual(toolDefinitions.map((tool) => tool.name).sort());
  });

  it.each(toolDefinitions.map((tool) => tool.name))("keeps every %s result within the bound", async (name) => {
    const results = await cases[name]();

    expect(results.length).toBeGreaterThan(0);
    for (const result of results) expect(resultBytes(result), name).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  }, 60_000);

  it("names the bound in every tool description that promises it", () => {
    for (const tool of toolDefinitions) {
      if (tool.description.includes("KB")) expect(tool.description, tool.name).toContain(`${MAX_RESULT_BYTES / 1024}KB`);
    }
  });
});
