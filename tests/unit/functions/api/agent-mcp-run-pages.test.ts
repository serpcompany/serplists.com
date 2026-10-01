import { describe, expect, it } from "vitest";
import { elementAt, firstOf, sectionAt, taskIn } from "../../../support/elements";

import { MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import {
  describeRunRead,
  readRun,
  runView,
  startedRunResult,
  updatedRunResult,
  type RunReadArgs,
  type RunView,
} from "@functions/api/handlers/agentMcpRunPages";
import { MAX_TASK_NOTES_LENGTH } from "@functions/api/handlers/agentMcpTools";
import { RUN_KEY_REQUESTS_PER_MINUTE } from "@functions/api/utils/mcp-limits";
import { contentSaveBytes, RUN_CONTENT_MAX_BYTES } from "@/lib/schemas/contentLimits";
import {
  asTheClientReceives,
  cursorMovedPastTheEnd,
  expectAnInvalidCursor,
  expectReadBackInFullWithinTheBound,
  outlineOf,
  resultBytes,
  sectionFieldsOfTheFirstTwoPages,
  toolErrorOf,
} from "../../../support/agentMcp";
import { MULTIBYTE_PROSE_BYTES_PER_CHARACTER_AT_MOST, multibyteProse, TEXT_COSTLIER_IN_JSON } from "../../../support/jsonText";
import { reproducibleShapes } from "../../../support/reproducibleRandom";
import { readRetiredWork, readRunInFull } from "../../../support/runPages";

type JsonRecord = Record<string, unknown>;

const D1_ROW_MAX_BYTES = 2_000_000;
const NOTE_LENGTH_ONLY_THE_WEB_APP_WRITES = 200_000;

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

const runTask = (id: string, notesBytes = 100, notes = "x") => ({
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
  Array.from({ length: count }, (_, s) => section(`s${s}`, Array.from({ length: tasks }, (_, t) => runTask(`t${s}-${t}`, notesBytes))));

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

async function readInFullWithinTheBound(view: RunView) {
  const read = await readRunInFull((args) => asTheClientReceives(readRun(view, args as RunReadArgs)), "run-1");
  for (const result of read.results) expect(resultBytes(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  return read;
}

function everyPageOf(view: RunView, args: RunReadArgs): JsonRecord[] {
  const pages = [readRun(view, args)];
  while (typeof pages.at(-1)?.nextCursor === "string") pages.push(readRun(view, { cursor: pages.at(-1)?.nextCursor as string }));
  return pages;
}

describe("get_run results", () => {
  it("returns a run whole up to the bound, and an outline one byte over", () => {
    const sized = (notesBytes: number) => viewOf([section("s1", [runTask("t1", notesBytes)])]);
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
    const retired = [retiredTask("s0", runTask("gone", 400))];
    const view = viewOf([...sections(3, 20, 1_000), section("long", [runTask("t-long")], longTitle)], retired);
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
      outline: outlineOf(view.sections),
      limit: MAX_RESULT_BYTES,
    });
    const entry = elementAt(outline.outline as JsonRecord[], 3);
    expect(String(entry.title).endsWith("…")).toBe(true);
    expect((readRun(view, { sectionId: "long" }).section as JsonRecord).title).toBe(longTitle);
    expect(describeRunRead(outline)).toBe(
      'Run "Release run" is too large to return at once, so this is its outline; read a section with sectionId.',
    );
  });

  it("pages an outline longer than one result and reads every section behind it", async () => {
    const view = viewOf(sections(600, 1, 100));
    const { run, results } = await readInFullWithinTheBound(view);

    const outlinePages = results.filter((result) => Array.isArray(result.outline));
    expect(outlinePages.length).toBeGreaterThan(1);
    expect(elementAt(outlinePages, 1).run).toEqual(ref);
    expect(run).toEqual(wholeOf(view));
  });

  it("returns a section that fits whole, and a task that fits whole", () => {
    const view = viewOf(sections(4, 20, 1_000));

    expect(readRun(view, { sectionId: "s2" })).toEqual({ run: ref, section: view.sections[2] });
    const found = readRun(view, { taskId: "t2-3" });
    expect(found).toEqual({ run: ref, sectionId: "s2", task: (sectionAt(view, 2).items as JsonRecord[])[3] });
    expect(describeRunRead(found)).toBe('Loaded task "Task t2-3".');
  });

  it("pages a section too large for one result a run of whole tasks at a time, its fields first", () => {
    const view = viewOf([section("big", Array.from({ length: 200 }, (_, index) => runTask(`t${index}`, 500)))]);
    const pages = everyPageOf(view, { sectionId: "big" });

    const { first, second } = sectionFieldsOfTheFirstTwoPages(pages);
    expect(second).toMatchObject({ id: "big", taskCount: 200, firstTask: (first.items as unknown[]).length });
    expect(pages.flatMap((page) => (page.section as JsonRecord).items as JsonRecord[])).toEqual(sectionAt(view, 0).items);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page.run).toEqual(ref);
    }
    expect(describeRunRead(elementAt(pages, 1))).toMatch(/^Loaded tasks \d+-\d+ of the 200 in a section too large for one result\. More follows: call get_run/);
  });

  it("returns a task whose notes are too large for one result in parts whose text joins into it", () => {
    const view = viewOf([section("s1", [runTask("small"), runTask("huge", 100_000, TEXT_COSTLIER_IN_JSON), runTask("after")])]);
    const pages = everyPageOf(view, { taskId: "huge" });

    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page).toMatchObject({ run: ref, sectionId: "s1", part: { of: "task", index: 1 } });
    }
    const text = pages.map((page) => (page.part as JsonRecord).text).join("");
    expect(JSON.parse(text)).toEqual(asTheClientReceives((sectionAt(view, 0).items as JsonRecord[])[1]));
    expect(describeRunRead(firstOf(pages))).toContain("join its parts' text in order");
  });

  it("keeps every result within the bound and reads any run back in full", async () => {
    for (let seed = 1; seed <= 20; seed += 1) {
      const { next, pick, text } = reproducibleShapes(seed, "Checked the rollback plan with the on-call engineer. ");
      const randomTask = (id: string) => ({
        ...runTask(id, 0),
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
      const { run, results } = await readInFullWithinTheBound(view);

      expectReadBackInFullWithinTheBound(run, wholeOf(view), results, seed);
    }
  }, 60_000);
});

describe("get_run retired work", () => {
  const live = [section("s1", [runTask("t1"), runTask("t2")]), section("s2", [runTask("t3")])];
  const retired = [
    retiredSection("old", [runTask("old-1"), runTask("old-2")]),
    retiredTask("s1", runTask("dns")),
    retiredTask("old", { ...runTask("dns"), title: "DNS, earlier" }),
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
    const oldSection = firstOf(view.retired).section as JsonRecord;
    const oldSectionNarrowedToItsSecondTask = { kind: "section", section: { ...oldSection, items: [(oldSection.items as JsonRecord[])[1]] } };
    expect(readRun(view, { retired: true, sectionId: "old", taskId: "old-2" }).retiredItems).toEqual([oldSectionNarrowedToItsSecondTask]);
  });

  it("reads no retired work for a live section or task that has none", () => {
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

  it("pages retired work too large for one result, all of it or a section's, whole entries first and parts of any larger one", async () => {
    const many = [
      ...Array.from({ length: 300 }, (_, index) => retiredTask("s1", runTask(`gone-${index}`, 400))),
      retiredSection("huge", [runTask("huge-1", 90_000, TEXT_COSTLIER_IN_JSON)]),
      retiredSubTask("s1", "t1", "sub-last"),
    ];
    const large = viewOf(live, many);
    const pages = everyPageOf(large, { retired: true });

    expect(pages.length).toBeGreaterThan(8);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page.run).toEqual(ref);
      if (!page.part) expect(page).toMatchObject({ retiredCount: 302, firstRetired: expect.any(Number) });
    }
    expect(pages.some((page) => (page.part as JsonRecord | undefined)?.of === "retiredItem")).toBe(true);
    expect(describeRunRead(firstOf(pages))).toMatch(/^Loaded retired entries 1-\d+ of the 302, too many for one result\. More follows/);
    expect(await readRetiredWork((args) => asTheClientReceives(readRun(large, args as RunReadArgs)))).toEqual(asTheClientReceives(large.retired));

    const sectionPages = everyPageOf(large, { retired: true, sectionId: "s1" });
    expect(sectionPages.length).toBeGreaterThan(2);
    expect(sectionPages.flatMap((page) => (page.retiredItems as JsonRecord[]) ?? [])).toHaveLength(301);
  });
});

describe("get_run cursors", () => {
  const view = viewOf(
    [section("big", Array.from({ length: 200 }, (_, index) => runTask(`t${index}`, 500))), section("s2", [runTask("x")])],
    Array.from({ length: 200 }, (_, index) => retiredTask("s2", runTask(`gone-${index}`, 400))),
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
    ["a cursor past the end", () => readRun(view, { cursor: cursorMovedPastTheEnd(sectionCursor) })],
  ])("refuses %s as invalid arguments", (_name, action) => {
    expectAnInvalidCursor(action);
  });
});

describe("a run at the size limits", () => {
  const notedTask = (id: string, notesLength: number) => ({ ...runTask(id, 0), notes: multibyteProse(notesLength) });

  function liveContentJustUnderTheRunLimit(): JsonRecord[] {
    const live: JsonRecord[] = [
      section("notes", Array.from({ length: 12 }, (_, index) => notedTask(`note-${index}`, MAX_TASK_NOTES_LENGTH))),
      section("huge", [notedTask("huge-note", NOTE_LENGTH_ONLY_THE_WEB_APP_WRITES)]),
    ];
    for (let index = 0; contentSaveBytes(live) < RUN_CONTENT_MAX_BYTES - 40_000; index += 1) {
      live.push(section(`area-${index}`, Array.from({ length: 12 }, (_, t) => notedTask(`area-${index}-${t}`, 700))));
    }
    const filler = firstOf(live.at(-1)?.items as JsonRecord[]);
    const bytesLeft = RUN_CONTENT_MAX_BYTES - 1_024 - contentSaveBytes(live);
    filler.notes = multibyteProse(String(filler.notes).length + Math.floor(bytesLeft / MULTIBYTE_PROSE_BYTES_PER_CHARACTER_AT_MOST));
    return live;
  }

  const aboutOneMegabyteOfRetiredWork = (): JsonRecord[] => [
    ...Array.from({ length: 20 }, (_, index) =>
      retiredSection(`gone-${index}`, Array.from({ length: 10 }, (_, t) => notedTask(`gone-${index}-${t}`, 2_000)))),
    retiredSection("gone-large", [notedTask("gone-large-1", 120_000)]),
    ...Array.from({ length: 300 }, (_, index) => retiredTask(`area-${index % 20}`, notedTask(`removed-${index}`, 900))),
    ...Array.from({ length: 200 }, (_, index) => retiredSubTask("notes", `note-${index % 12}`, `removed-sub-${index}`)),
  ];

  const maximumRun = (): RunView =>
    viewOf(liveContentJustUnderTheRunLimit(), aboutOneMegabyteOfRetiredWork(), { title: multibyteProse(160) });

  it("reads a maximum run back in full, each result within the bound, in fewer calls than a Run Key may make a minute", async () => {
    const view = maximumRun();
    const content = contentSaveBytes(view.sections);
    expect(content).toBeLessThanOrEqual(RUN_CONTENT_MAX_BYTES);
    expect(content).toBeGreaterThan(RUN_CONTENT_MAX_BYTES - 8 * 1024);
    expect(resultBytes(view.retired)).toBeGreaterThan(900 * 1024);
    expect(resultBytes(view.sections) + resultBytes(view.retired)).toBeLessThan(D1_ROW_MAX_BYTES);

    const { run, results } = await readInFullWithinTheBound(view);

    expect(run).toEqual(asTheClientReceives(wholeOf(view)));
    const parts = new Set(results.flatMap((result) => (result.part ? [(result.part as JsonRecord).of] : [])));
    expect(parts).toEqual(new Set(["task", "retiredItem"]));
    expect(results.length).toBeLessThan(RUN_KEY_REQUESTS_PER_MINUTE);
  });
});

describe("run write results", () => {
  it("returns a started run whole when it fits, otherwise its fields without sections", () => {
    const small = viewOf([section("s1", [runTask("t1")])]);
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
    const stored = [section("s1", [runTask("t1"), runTask("big", 40_000)])];
    const header = viewOf(stored).header;
    const notes = { runId: "run-1", expectedRevision: 5, operation: "set_task_notes" as const, notes: "Done" };

    expect(updatedRunResult(header, stored, { ...notes, taskId: "t1" })).toEqual({
      run: header,
      sectionId: "s1",
      taskId: "t1",
      task: taskIn(stored, 0, 0),
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
