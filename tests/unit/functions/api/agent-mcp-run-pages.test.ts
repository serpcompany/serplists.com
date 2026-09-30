import { describe, expect, it } from "vitest";

import { MAX_RESULT_BYTES, toJson } from "@functions/api/handlers/agentMcpPages";
import {
  describeRunRead,
  readRun,
  runView,
  startedRunResult,
  updatedRunResult,
  type RunReadArgs,
  type RunView,
} from "@functions/api/handlers/agentMcpRunPages";
import { ToolError } from "@functions/api/handlers/agentMcpTools";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES } from "@/lib/schemas/contentLimits";
import { readRetiredWork, readRunInFull } from "../../../support/runPages";

type JsonRecord = Record<string, unknown>;

// What a client receives: agentMcp.ts sends every string well formed.
const onWire = <T>(value: T): T => JSON.parse(toJson(value)) as T;
const resultBytes = (value: unknown) => new TextEncoder().encode(toJson(value)).byteLength;

const row = (sections: unknown[], retired: unknown[] = [], overrides: JsonRecord = {}): JsonRecord => ({
  id: "run-1",
  user_id: "user-1",
  team_id: null,
  template_id: "template-1",
  title: "Release run",
  items: JSON.stringify(sections),
  retired_items: JSON.stringify(retired),
  status: "in_progress",
  progress: 25,
  revision: 5,
  template_version: 3,
  started_at: "2026-09-01T00:00:00.000Z",
  completed_at: null,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
  deleted_at: null,
  ...overrides,
});

const viewOf = (sections: unknown[], retired: unknown[] = [], overrides: JsonRecord = {}) => runView(row(sections, retired, overrides));

// A task as a run stores it: completion, notes, a text block and a Sub-tasks block.
const task = (id: string, notesBytes = 100, notes = "x") => ({
  id,
  title: `Task ${id}`,
  description: "",
  isCompleted: false,
  notes: notes.repeat(Math.ceil(notesBytes / notes.length)).slice(0, notesBytes),
  contents: [
    { id: `${id}-text`, type: "text", value: "Check the release notes." },
    { id: `${id}-subs`, type: "subItems", value: "", subItems: [{ id: `${id}-sub`, title: "Sub-task", isCompleted: false }] },
  ],
});

const section = (id: string, tasks: JsonRecord[], title = `Section ${id}`) => ({ id, title, items: tasks });

const sections = (count: number, tasks: number, notesBytes: number) =>
  Array.from({ length: count }, (_, s) => section(`s${s}`, Array.from({ length: tasks }, (_, t) => task(`t${s}-${t}`, notesBytes))));

const retiredSection = (id: string, tasks: JsonRecord[]) => ({ kind: "section", section: section(id, tasks, `Retired ${id}`) });
const retiredTask = (sectionId: string, retired: JsonRecord) => ({ kind: "item", sectionId, sectionTitle: "Release", item: retired });
const retiredSubTask = (sectionId: string, itemId: string, id: string) => ({
  kind: "subItem",
  sectionId,
  itemId,
  itemTitle: "Verify",
  subItem: { id, title: "Old check", isCompleted: true },
});

const wholeOf = (view: RunView) => ({ ...view.header, sections: view.sections, retiredItems: view.retired });
const ref = { id: "run-1", revision: 5 };

function toolErrorOf(action: () => unknown): ToolError {
  try {
    action();
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error("expected a ToolError");
}

// Reads the whole run as a client receives it, checking every result against the bound.
async function readBack(view: RunView) {
  const read = await readRunInFull((args) => onWire(readRun(view, args as RunReadArgs)), "run-1");
  for (const result of read.results) expect(resultBytes(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  return read;
}

// Every page of one read, following nextCursor.
function pagesOf(view: RunView, args: RunReadArgs): JsonRecord[] {
  const pages = [readRun(view, args)];
  while (typeof pages.at(-1)?.nextCursor === "string") pages.push(readRun(view, { cursor: pages.at(-1)?.nextCursor as string }));
  return pages;
}

// A small deterministic generator, so a failing shape can be reproduced.
function random(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let value = Math.imul(state ^ (state >>> 15), 1 | state);
    value = (value + Math.imul(value ^ (value >>> 7), 61 | value)) ^ value;
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

// Text that costs more inside JSON than it looks: escapes, control characters, several scripts,
// emoji (surrogate pairs) and a lone surrogate half.
const AWKWARD = 'He said "ship it" \\ now\n\ttabs\u0001\u001f · Ünïcödé 日本語テキスト 🚀🧪 \uD83D end';

describe("get_run results", () => {
  it("returns a run whole up to the bound, and an outline one byte over", () => {
    const sized = (notesBytes: number) => viewOf([section("s1", [task("t1", notesBytes)])]);
    const base = resultBytes(readRun(sized(0), {}));
    const atBound = readRun(sized(MAX_RESULT_BYTES - base), {});
    const overBound = readRun(sized(MAX_RESULT_BYTES - base + 1), {});

    expect(resultBytes(atBound)).toBe(MAX_RESULT_BYTES);
    expect(atBound).toEqual({ run: wholeOf(sized(MAX_RESULT_BYTES - base)) });
    expect(overBound.sectionsOmitted).toBe(true);
    expect(overBound).not.toHaveProperty("run.sections");
    expect(describeRunRead(atBound)).toBe('Loaded run "Release run".');
  });

  it("outlines a larger run: its fields, counts, retired work, and each section's id, title, tasks, and size", () => {
    const longTitle = `Launch ${"L".repeat(300)}`;
    const retired = [retiredTask("s0", task("gone", 400))];
    const view = viewOf([...sections(3, 20, 1_000), section("long", [task("t-long")], longTitle)], retired);
    const outline = readRun(view, {});

    expect(outline).toEqual({
      run: {
        ...view.header,
        sectionCount: 4,
        taskCount: 61,
        bytes: resultBytes(view.sections),
        retiredCount: 1,
        retiredBytes: resultBytes(view.retired),
      },
      sectionsOmitted: true,
      outline: view.sections.map((entry) => expect.objectContaining({
        id: entry.id,
        taskCount: (entry.items as unknown[]).length,
        bytes: resultBytes(entry),
      })),
      limit: MAX_RESULT_BYTES,
    });
    const entry = (outline.outline as JsonRecord[])[3];
    expect(String(entry.title).endsWith("…")).toBe(true);
    expect((readRun(view, { sectionId: "long" }).section as JsonRecord).title).toBe(longTitle);
    expect(describeRunRead(outline)).toBe(
      'Run "Release run" is too large to return at once, so this is its outline; read a section with sectionId.',
    );
  });

  it("pages an outline longer than one result and reads every section behind it", async () => {
    const view = viewOf(sections(600, 1, 100));
    const { run, results } = await readBack(view);

    const outlinePages = results.filter((result) => Array.isArray(result.outline));
    expect(outlinePages.length).toBeGreaterThan(1);
    expect(outlinePages[1].run).toEqual(ref);
    expect(run).toEqual(wholeOf(view));
  });

  it("returns a section that fits whole, and a task that fits whole", () => {
    const view = viewOf(sections(4, 20, 1_000));

    expect(readRun(view, { sectionId: "s2" })).toEqual({ run: ref, section: view.sections[2] });
    const found = readRun(view, { taskId: "t2-3" });
    expect(found).toEqual({ run: ref, sectionId: "s2", task: (view.sections[2].items as JsonRecord[])[3] });
    expect(describeRunRead(found)).toBe('Loaded task "Task t2-3".');
  });

  it("pages a section too large for one result a run of whole tasks at a time, its fields first", () => {
    const view = viewOf([section("big", Array.from({ length: 200 }, (_, index) => task(`t${index}`, 500)))]);
    const pages = pagesOf(view, { sectionId: "big" });

    expect(pages.length).toBeGreaterThan(3);
    const [first, second] = pages.map((page) => page.section as JsonRecord);
    expect(first).toMatchObject({ id: "big", title: "Section big", taskCount: 200, firstTask: 0 });
    expect(second).toMatchObject({ id: "big", taskCount: 200, firstTask: (first.items as unknown[]).length });
    expect(pages.flatMap((page) => (page.section as JsonRecord).items as JsonRecord[])).toEqual(view.sections[0].items);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page.run).toEqual(ref);
    }
    expect(describeRunRead(pages[1])).toMatch(/^Loaded tasks \d+-\d+ of the 200 in a section too large for one result\. More follows: call get_run/);
  });

  it("returns a task whose notes are too large for one result in parts whose text joins into it", () => {
    const view = viewOf([section("s1", [task("small"), task("huge", 100_000, AWKWARD), task("after")])]);
    const pages = pagesOf(view, { taskId: "huge" });

    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page).toMatchObject({ run: ref, sectionId: "s1", part: { of: "task", index: 1 } });
    }
    const text = pages.map((page) => (page.part as JsonRecord).text).join("");
    expect(JSON.parse(text)).toEqual(onWire((view.sections[0].items as JsonRecord[])[1]));
    expect(describeRunRead(pages[0])).toContain("join its parts' text in order");
  });

  it("keeps every result within the bound and reads any run back in full", async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const next = random(seed);
      const pick = (max: number) => Math.floor(next() * max);
      const text = (max: number) => {
        const length = pick(max);
        const source = next() < 0.3 ? AWKWARD : "Checked the rollback plan with the on-call engineer. ";
        return source.repeat(Math.ceil(length / source.length) + 1).slice(0, length);
      };
      const randomTask = (id: string) => ({
        ...task(id, 0),
        title: text(80) || "Task",
        notes: text(next() < 0.03 ? 60_000 : 400),
        isCompleted: next() < 0.5,
      });
      const live = Array.from({ length: 1 + pick(seed % 3 === 0 ? 150 : 25) }, (_, s) =>
        section(`s${s}`, Array.from({ length: 1 + pick(next() < 0.1 ? 60 : 6) }, (_, t) => randomTask(`s${s}-t${t}`)), text(60) || "Section"));
      const retired = Array.from({ length: pick(seed % 2 === 0 ? 200 : 10) }, (_, index) => {
        const kind = pick(3);
        if (kind === 0) return retiredSection(`r${index}`, Array.from({ length: 1 + pick(8) }, (_, t) => randomTask(`r${index}-t${t}`)));
        if (kind === 1) return retiredTask(`s${pick(live.length)}`, randomTask(`r${index}`));
        return retiredSubTask(`s${pick(live.length)}`, `s0-t0`, `r${index}-sub`);
      });
      const view = viewOf(live, retired, { title: text(200) || "Run" });
      const { run, results } = await readBack(view);

      expect(run, `seed ${seed}`).toEqual(onWire(wholeOf(view)));
      expect(results.every((result) => resultBytes(result) <= MAX_RESULT_BYTES), `seed ${seed}`).toBe(true);
    }
  }, 60_000);
});

describe("get_run retired work", () => {
  const live = [section("s1", [task("t1"), task("t2")]), section("s2", [task("t3")])];
  const retired = [
    retiredSection("old", [task("old-1"), task("old-2")]),
    retiredTask("s1", task("dns")),
    retiredTask("old", { ...task("dns"), title: "DNS, earlier" }),
    retiredSubTask("s1", "t1", "sub-9"),
    { kind: "section" },
    { sectionId: "s1" },
  ];
  const view = viewOf(live, retired);

  it("reads retired work whole with retired: true, and a whole run carries it", () => {
    const result = readRun(view, { retired: true });

    expect(result).toEqual({ run: ref, retiredItems: view.retired });
    expect(describeRunRead(result)).toBe("Loaded 6 retired entries.");
    expect((readRun(view, {}).run as JsonRecord).retiredItems).toEqual(view.retired);
  });

  it("narrows retired work to a section or a task, keeping every copy of a repeated id", () => {
    expect(readRun(view, { retired: true, sectionId: "s1" }).retiredItems).toEqual([view.retired[1], view.retired[3], view.retired[5]]);
    expect(readRun(view, { retired: true, sectionId: "old" }).retiredItems).toEqual([view.retired[0], view.retired[2]]);
    expect(readRun(view, { retired: true, taskId: "t1" }).retiredItems).toEqual([view.retired[3]]);
    expect(readRun(view, { retired: true, taskId: "dns" }).retiredItems).toEqual([view.retired[1], view.retired[2]]);
    // A retired section narrowed to one of its tasks.
    const old = view.retired[0].section as JsonRecord;
    expect(readRun(view, { retired: true, sectionId: "old", taskId: "old-2" }).retiredItems).toEqual([
      { kind: "section", section: { ...old, items: [(old.items as JsonRecord[])[1]] } },
    ]);
    // A live section or task without retired work has none.
    expect(readRun(view, { retired: true, sectionId: "s2" }).retiredItems).toEqual([]);
    expect(readRun(view, { retired: true, taskId: "t3" }).retiredItems).toEqual([]);
  });

  it("names ids that neither live nor retired work holds, and points live reads of retired ids at retired: true", () => {
    expect(toolErrorOf(() => readRun(view, { retired: true, sectionId: "missing" }))).toMatchObject({ code: "section_not_found" });
    expect(toolErrorOf(() => readRun(view, { retired: true, taskId: "missing" }))).toMatchObject({ code: "task_not_found" });
    expect(toolErrorOf(() => readRun(view, { retired: true, sectionId: "old", taskId: "t1" }))).toMatchObject({
      code: "task_not_found",
      message: "Task not found (taskId in sectionId)",
    });
    expect(toolErrorOf(() => readRun(view, { sectionId: "old" }))).toMatchObject({
      code: "section_not_found",
      message: "Section not found (sectionId): it is retired work; read it with retired: true",
    });
    expect(toolErrorOf(() => readRun(view, { taskId: "dns" }))).toMatchObject({
      code: "task_not_found",
      message: "Task not found (taskId): it is retired work; read it with retired: true",
    });
    expect(toolErrorOf(() => readRun(view, { taskId: "missing" }))).toMatchObject({ code: "task_not_found", message: "Task not found (taskId)" });
  });

  it("pages retired work too large for one result, whole entries first and parts of any larger one", async () => {
    const many = [
      ...Array.from({ length: 300 }, (_, index) => retiredTask("s1", task(`gone-${index}`, 400))),
      retiredSection("huge", [task("huge-1", 90_000, AWKWARD)]),
      retiredSubTask("s1", "t1", "sub-last"),
    ];
    const large = viewOf(live, many);
    const pages = pagesOf(large, { retired: true });

    expect(pages.length).toBeGreaterThan(8);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page.run).toEqual(ref);
      if (!page.part) expect(page).toMatchObject({ retiredCount: 302, firstRetired: expect.any(Number) });
    }
    expect(pages.some((page) => (page.part as JsonRecord | undefined)?.of === "retiredItem")).toBe(true);
    expect(describeRunRead(pages[0])).toMatch(/^Loaded retired entries 1-\d+ of the 302, too many for one result\. More follows/);
    expect(await readRetiredWork((args) => onWire(readRun(large, args as RunReadArgs)))).toEqual(onWire(large.retired));

    // A scope's retired work pages the same way, its ids kept in the cursor.
    const scoped = pagesOf(large, { retired: true, sectionId: "s1" });
    expect(scoped.length).toBeGreaterThan(2);
    expect(scoped.flatMap((page) => (page.retiredItems as JsonRecord[]) ?? [])).toHaveLength(301);
  });
});

describe("get_run cursors", () => {
  const view = viewOf(
    [section("big", Array.from({ length: 200 }, (_, index) => task(`t${index}`, 500))), section("s2", [task("x")])],
    Array.from({ length: 200 }, (_, index) => retiredTask("s2", task(`gone-${index}`, 400))),
  );
  const sectionCursor = readRun(view, { sectionId: "big" }).nextCursor as string;
  const retiredCursor = readRun(view, { retired: true, sectionId: "s2" }).nextCursor as string;

  it("continues a read from the revision it started on, and fails with edit_conflict after a change", () => {
    expect(readRun(view, { cursor: sectionCursor })).toHaveProperty("section.firstTask");
    expect(readRun(view, { cursor: sectionCursor, sectionId: "big" })).toHaveProperty("section.firstTask");
    expect(readRun(view, { cursor: retiredCursor })).toHaveProperty("firstRetired");
    expect(readRun(view, { cursor: retiredCursor, retired: true, sectionId: "s2" })).toHaveProperty("firstRetired");

    const changed = { ...view, header: { ...view.header, revision: 6 } };
    for (const cursor of [sectionCursor, retiredCursor]) {
      const error = toolErrorOf(() => readRun(changed, { cursor }));
      expect(error.code).toBe("edit_conflict");
      expect(error.details).toEqual({ expectedRevision: 5, currentRevision: 6 });
    }
  });

  it.each([
    ["a value it did not make", () => readRun(view, { cursor: "not-a-cursor" })],
    ["another run's cursor", () => readRun({ ...view, header: { ...view.header, id: "run-2" } }, { cursor: sectionCursor })],
    ["a cursor with another section", () => readRun(view, { cursor: sectionCursor, sectionId: "s2" })],
    ["a cursor with a task", () => readRun(view, { cursor: sectionCursor, taskId: "t0" })],
    ["a section cursor with retired", () => readRun(view, { cursor: sectionCursor, retired: true })],
    ["a retired cursor without retired", () => readRun(view, { cursor: retiredCursor, retired: false })],
    ["a retired cursor with another section", () => readRun(view, { cursor: retiredCursor, sectionId: "big" })],
    ["a cursor past the end", () => {
      const decoded = JSON.parse(Buffer.from(sectionCursor, "base64url").toString("utf8")) as JsonRecord;
      return readRun(view, { cursor: Buffer.from(JSON.stringify({ ...decoded, u: 5_000 })).toString("base64url") });
    }],
  ])("refuses %s as invalid arguments", (_name, action) => {
    const error = toolErrorOf(action);
    expect(error.code).toBe("invalid_arguments");
    expect(error.message).toMatch(/^cursor: /);
  });
});

describe("a run at the size limits", () => {
  const PROSE = "Confirmed the owner, the rollback plan, and the customer notice — then recorded it. Überprüfen. 界 🚀 ";
  const prose = (length: number) => PROSE.repeat(Math.ceil(length / PROSE.length)).slice(0, length);

  // Content just under the run limit as the app counts it: tasks with 20,000-character notes (the
  // most update_run writes), a task with a 200,000-character note (the web app writes any length),
  // and sections of shorter tasks; beside it about 1MB of retired work, which only D1's 2MB row
  // bounds.
  function maximumRun(): RunView {
    const live: JsonRecord[] = [
      section("notes", Array.from({ length: 12 }, (_, index) => ({ ...task(`note-${index}`, 0), notes: prose(20_000) }))),
      section("huge", [{ ...task("huge-note", 0), notes: prose(200_000) }]),
    ];
    for (let index = 0; contentSaveBytes(live) < RUN_CONTENT_MAX_BYTES - 40_000; index += 1) {
      live.push(section(`area-${index}`, Array.from({ length: 12 }, (_, t) => ({ ...task(`area-${index}-${t}`, 0), notes: prose(700) }))));
    }
    // PROSE takes about 1.06 bytes a character.
    const filler = (live.at(-1)?.items as JsonRecord[])[0];
    filler.notes = prose(String(filler.notes).length + Math.floor((RUN_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(live)) / 1.1));
    const retired: JsonRecord[] = [
      ...Array.from({ length: 20 }, (_, index) =>
        retiredSection(`gone-${index}`, Array.from({ length: 10 }, (_, t) => ({ ...task(`gone-${index}-${t}`, 0), notes: prose(2_000) })))),
      retiredSection("gone-large", [{ ...task("gone-large-1", 0), notes: prose(120_000) }]),
      ...Array.from({ length: 300 }, (_, index) => retiredTask(`area-${index % 20}`, { ...task(`removed-${index}`, 0), notes: prose(900) })),
      ...Array.from({ length: 200 }, (_, index) => retiredSubTask("notes", `note-${index % 12}`, `removed-sub-${index}`)),
    ];
    return viewOf(live, retired, { title: prose(160) });
  }

  it("reads a maximum run back in full, each result within the bound", async () => {
    const view = maximumRun();
    const content = contentSaveBytes(view.sections);
    expect(content).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
    expect(content).toBeGreaterThan(RUN_CONTENT_MAX_BYTES - 8 * 1024);
    expect(resultBytes(view.retired)).toBeGreaterThan(900 * 1024);
    // Within the 2MB a D1 row holds.
    expect(resultBytes(view.sections) + resultBytes(view.retired)).toBeLessThan(2_000_000);

    const { run, results } = await readBack(view);

    expect(run).toEqual(onWire(wholeOf(view)));
    const parts = new Set(results.flatMap((result) => (result.part ? [(result.part as JsonRecord).of] : [])));
    expect(parts).toEqual(new Set(["task", "retiredItem"]));
    // About 2MB in 32KB results: a few dozen calls, within a Run Key's 120 a minute.
    expect(results.length).toBeLessThan(120);
  });
});

describe("run write results", () => {
  it("returns a started run whole when it fits, otherwise its fields without sections", () => {
    const small = viewOf([section("s1", [task("t1")])]);
    const large = viewOf(sections(40, 10, 400));
    const legacy = viewOf(sections(40, 10, 400), [], { title: "\u0001".repeat(10_000) });

    expect(startedRunResult(small)).toEqual({ run: wholeOf(small) });
    expect(startedRunResult(large)).toEqual({ run: large.header, sectionsOmitted: true });
    expect(startedRunResult(legacy)).toEqual({
      run: { id: "run-1", title: `${"\u0001".repeat(159)}…`, status: "in_progress", progress: 25, revision: 5 },
      sectionsOmitted: true,
    });
    for (const result of [startedRunResult(large), startedRunResult(legacy)]) expect(resultBytes(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  });

  it("returns an update's run fields and the changed task when it fits, and names it otherwise", () => {
    const stored = [section("s1", [task("t1"), task("big", 40_000)])];
    const header = viewOf(stored).header;
    const notes = { runId: "run-1", expectedRevision: 5, operation: "set_task_notes" as const, notes: "Done" };

    expect(updatedRunResult(header, stored, { ...notes, taskId: "t1" })).toEqual({
      run: header,
      sectionId: "s1",
      taskId: "t1",
      task: stored[0].items[0],
    });
    expect(updatedRunResult(header, stored, { ...notes, taskId: "big" })).toEqual({
      run: header,
      sectionId: "s1",
      taskId: "big",
      taskOmitted: true,
    });
    expect(updatedRunResult(header, stored, { runId: "run-1", expectedRevision: 5, operation: "set_run_status", status: "in_progress" }))
      .toEqual({ run: header });
  });
});
