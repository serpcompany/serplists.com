import { beforeEach, describe, expect, it, vi } from "vitest";

import { MigratedSqliteD1 } from "../../../support/sqlite-d1";

vi.mock("@functions/api/utils/personal-run-key", () => ({
  authenticatePersonalRunKey: vi.fn(),
  markPersonalRunKeyUsed: vi.fn(),
}));

import { handleAgentMcp } from "@functions/api/handlers/agentMcp";
import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import { MAX_TASK_NOTES_BYTES, MAX_TASK_NOTES_LENGTH, toolDefinitions } from "@functions/api/handlers/agentMcpTools";
import { authenticatePersonalRunKey, markPersonalRunKeyUsed } from "@functions/api/utils/personal-run-key";
import {
  contentSaveBytes,
  RUN_CONTENT_MAX_BYTES,
  TEMPLATE_CONTENT_MAX_BYTES,
} from "@/lib/schemas/contentLimits";
import { TEMPLATE_DESCRIPTION_MAX, TEMPLATE_LIST_ITEM_MAX, TEMPLATE_LIST_MAX_ITEMS, TEMPLATE_TITLE_MAX } from "@/lib/schemas/templateLimits";
import { authenticateWithAFreshRunKey, mcpToolCall, resultBytes } from "../../../support/agentMcp";
import { costliestJsonText, MULTIBYTE_PROSE_BYTES_PER_CHARACTER_AT_MOST, multibyteProse } from "../../../support/jsonText";
import { readRunInFull } from "../../../support/runPages";
import { readTemplateInFull } from "../../../support/templatePages";

type JsonRecord = Record<string, unknown>;

const NOW = "2026-09-30T00:00:00.000Z";
const CREATE_TEMPLATE_MAX_SECTIONS = 100;
const NOTE_LENGTH_ONLY_THE_WEB_APP_WRITES = 200_000;

let d1: MigratedSqliteD1;
let calls = 0;

async function call(name: string, args: JsonRecord): Promise<JsonRecord> {
  calls += 1;
  authenticateWithAFreshRunKey(authenticatePersonalRunKey);
  const response = await handleAgentMcp(mcpToolCall(name, args, calls), { DB: d1.binding } as never);
  const body = await response.json() as JsonRecord;
  expect(body.error, name).toBeUndefined();
  const result = body.result as JsonRecord;
  expect(result.isError, `${name}: ${toJson(result.structuredContent).slice(0, 300)}`).toBeUndefined();
  return result.structuredContent as JsonRecord;
}

const task = (id: string, textLength: number) => ({
  id,
  title: `Task ${id}`,
  description: `Why ${id} matters`,
  contents: [
    { id: `${id}-text`, type: "text", value: multibyteProse(textLength) },
    { id: `${id}-subs`, type: "subItems", value: "", subItems: [{ id: `${id}-sub`, title: "Checked twice" }] },
  ],
});

function maximumTemplateSections(): JsonRecord[] {
  const taskTooLargeForOneResult = task("big", 100_000);
  const sections: JsonRecord[] = [{ id: "s0", title: costliestJsonText(TEMPLATE_TITLE_MAX), items: [taskTooLargeForOneResult] }];
  for (let index = 1; contentSaveBytes(sections) < TEMPLATE_CONTENT_MAX_BYTES - 16_000; index += 1) {
    sections.push({ id: `s${index}`, title: `Section ${index}`, items: Array.from({ length: 10 }, (_, t) => task(`s${index}-t${t}`, 500)) });
  }
  expect(sections.length).toBeLessThanOrEqual(CREATE_TEMPLATE_MAX_SECTIONS);
  const last = ((sections.at(-1)?.items as JsonRecord[])[0].contents as JsonRecord[])[0];
  const bytesLeft = TEMPLATE_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(sections);
  last.value = multibyteProse(String(last.value).length + Math.floor(bytesLeft / MULTIBYTE_PROSE_BYTES_PER_CHARACTER_AT_MOST));
  expect(contentSaveBytes(sections)).toBeLessThanOrEqual(TEMPLATE_CONTENT_MAX_BYTES);
  return sections;
}

const largestTemplateHeader = () => ({
  title: costliestJsonText(TEMPLATE_TITLE_MAX),
  description: costliestJsonText(TEMPLATE_DESCRIPTION_MAX),
  categories: Array.from({ length: TEMPLATE_LIST_MAX_ITEMS }, (_, index) => `${index}${costliestJsonText(TEMPLATE_LIST_ITEM_MAX - 2)}`),
  tags: Array.from({ length: TEMPLATE_LIST_MAX_ITEMS }, (_, index) => `${index}${costliestJsonText(TEMPLATE_LIST_ITEM_MAX - 2)}`),
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

const runTask = (id: string, notes: number) => ({ ...task(id, 200), isCompleted: false, notes: multibyteProse(notes) });

function liveContentJustUnderTheRunLimit(): JsonRecord[] {
  const sections: JsonRecord[] = [
    { id: "notes", title: costliestJsonText(TEMPLATE_TITLE_MAX), items: Array.from({ length: 12 }, (_, index) => runTask(`note-${index}`, MAX_TASK_NOTES_LENGTH)) },
    { id: "huge", title: "Huge", items: [runTask("huge-note", NOTE_LENGTH_ONLY_THE_WEB_APP_WRITES)] },
  ];
  for (let index = 0; contentSaveBytes(sections) < RUN_CONTENT_MAX_BYTES - 40_000; index += 1) {
    sections.push({ id: `area-${index}`, title: `Area ${index}`, items: Array.from({ length: 12 }, (_, t) => runTask(`area-${index}-${t}`, 500)) });
  }
  const filler = (sections.at(-1)?.items as JsonRecord[])[0];
  const bytesLeft = RUN_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(sections);
  filler.notes = multibyteProse(String(filler.notes).length + Math.floor(bytesLeft / MULTIBYTE_PROSE_BYTES_PER_CHARACTER_AT_MOST));
  return sections;
}

function maximumRun(): { sections: JsonRecord[]; retired: JsonRecord[] } {
  const sections = liveContentJustUnderTheRunLimit();
  const aboutOneMegabyteOfRetiredWork: JsonRecord[] = [
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
      subItem: { id: `removed-sub-${index}`, title: costliestJsonText(80), isCompleted: true },
    })),
  ];
  return { sections, retired: aboutOneMegabyteOfRetiredWork };
}

function withRoomForTheLongestNotes(run: { sections: JsonRecord[]; retired: JsonRecord[] }) {
  (run.sections[0].items as JsonRecord[]).splice(0, 2);
  return run;
}

function liftTheTemplateAndActiveRunLimits() {
  d1.run("INSERT INTO entitlement_overrides (user_id, plan, created_at) VALUES ('user-1', 'pro', ?)", NOW);
}

async function everyPageOf(name: "list_templates" | "list_runs"): Promise<JsonRecord[]> {
  const pages = [await call(name, {})];
  while (typeof pages.at(-1)?.nextCursor === "string") pages.push(await call(name, { cursor: pages.at(-1)?.nextCursor }));
  return pages;
}

const cases: Record<string, () => Promise<JsonRecord[]>> = {
  async list_templates() {
    const titleOverTodaysLimit = costliestJsonText(1_000);
    const descriptionOverTodaysLimit = costliestJsonText(20_000);
    for (let index = 0; index < 150; index += 1) {
      insertTemplate(`t-${String(index).padStart(3, "0")}`, [], { title: titleOverTodaysLimit, description: descriptionOverTodaysLimit });
    }
    const pages = await everyPageOf("list_templates");
    expect(pages.flatMap((page) => page.templates as unknown[])).toHaveLength(150);
    return pages;
  },

  async get_template() {
    const sectionsStoredBeforeTheContentLimit = [
      ...maximumTemplateSections(),
      ...maximumTemplateSections().map((section) => ({ ...section, id: `old-${String(section.id)}` })),
    ];
    insertTemplate("legacy", sectionsStoredBeforeTheContentLimit, largestTemplateHeader());
    const { template, results } = await readTemplateInFull((args) => call("get_template", args), "legacy");
    expect(template.sections).toHaveLength(sectionsStoredBeforeTheContentLimit.length);
    return results;
  },

  async create_template() {
    const created = await call("create_template", { ...largestTemplateHeader(), sections: maximumTemplateSections() });
    expect(created.sectionsOmitted).toBe(true);
    return [created];
  },

  async update_template() {
    const created = await call("create_template", { ...largestTemplateHeader(), sections: maximumTemplateSections() });
    const templateId = (created.template as JsonRecord).id;
    const versionOf = (result: JsonRecord) => (result.template as JsonRecord).version;
    const results = [
      await call("update_template", { templateId, expectedVersion: 1, operation: "replace_task", taskId: "big", task: { title: "Bigger" } }),
    ];
    results.push(await call("update_template", { templateId, expectedVersion: versionOf(results[0]), title: `${costliestJsonText(TEMPLATE_TITLE_MAX - 1)}!` }));
    const sections = maximumTemplateSections().reverse();
    results.push(await call("update_template", { templateId, expectedVersion: versionOf(results[1]), sections }));
    expect(results.map(versionOf)).toEqual([2, 3, 4]);
    return results;
  },

  async start_run() {
    insertTemplate("maximum", maximumTemplateSections(), largestTemplateHeader());
    const started = await call("start_run", { templateId: "maximum" });
    expect(started.sectionsOmitted).toBe(true);
    return [started, await call("start_run", { templateId: "maximum", title: costliestJsonText(TEMPLATE_TITLE_MAX) })];
  },

  async list_runs() {
    for (let index = 0; index < 150; index += 1) insertRun(`r-${String(index).padStart(3, "0")}`, [], [], { title: costliestJsonText(1_000) });
    const pages = await everyPageOf("list_runs");
    expect(pages.flatMap((page) => page.runs as unknown[])).toHaveLength(150);
    return pages;
  },

  async get_run() {
    const { sections, retired } = maximumRun();
    insertRun("maximum", sections, retired, { title: costliestJsonText(1_000) });
    const { run, results } = await readRunInFull((args) => call("get_run", args), "maximum");
    expect(run.sections).toHaveLength(sections.length);
    expect(run.retiredItems).toHaveLength(retired.length);
    return results;
  },

  async update_run() {
    const { sections, retired } = withRoomForTheLongestNotes(maximumRun());
    insertRun("maximum", sections, retired, { title: costliestJsonText(1_000) });
    const base = { runId: "maximum" };
    const longestNotes = "界".repeat(MAX_TASK_NOTES_BYTES / 3);
    return [
      await call("update_run", { ...base, expectedRevision: 1, operation: "set_task_completed", taskId: "huge-note", completed: true }),
      await call("update_run", { ...base, expectedRevision: 2, operation: "set_subtask_completed", taskId: "note-5", subtaskId: "note-5-sub", completed: true }),
      await call("update_run", { ...base, expectedRevision: 3, operation: "set_task_notes", taskId: "note-6", notes: longestNotes }),
      await call("update_run", { ...base, expectedRevision: 4, operation: "set_task_notes", taskId: "area-0-0", notes: costliestJsonText(5_000) }),
      await call("update_run", { ...base, expectedRevision: 5, operation: "set_run_status", status: "in_progress" }),
    ];
  },
};

describe("the largest result of every MCP tool", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(markPersonalRunKeyUsed).mockResolvedValue();
    d1 = new MigratedSqliteD1();
    d1.run("INSERT INTO users (id, email, name, email_verified, created_at) VALUES ('user-1', 'user-1@example.test', 'User', 1, ?)", NOW);
    liftTheTemplateAndActiveRunLimits();
  });

  it("has a case for every advertised tool, which a new tool fails until it has one", () => {
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
