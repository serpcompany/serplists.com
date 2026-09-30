import { describe, expect, it } from "vitest";

import { MAX_RESULT_BYTES, toWellFormedText } from "@functions/api/handlers/agentMcpPages";
import {
  describeTemplateRead,
  readTemplate,
  templateView,
  writtenTemplateResult,
  type TemplateView,
} from "@functions/api/handlers/agentMcpTemplatePages";
import { ToolError } from "@functions/api/handlers/agentMcpTools";
import { readTemplateInFull } from "../../../support/templatePages";

type JsonRecord = Record<string, unknown>;

// What a client receives: agentMcp.ts sends every string well formed.
const wellFormed = (_key: string, entry: unknown) => (typeof entry === "string" ? toWellFormedText(entry) : entry);
const onWire = <T>(value: T): T => JSON.parse(JSON.stringify(value, wellFormed)) as T;
const resultBytes = (value: unknown) => new TextEncoder().encode(JSON.stringify(value, wellFormed)).byteLength;

const row = (sections: unknown[], overrides: JsonRecord = {}): JsonRecord => ({
  id: "template-1",
  title: "Release SOP",
  description: "How we ship",
  type: "checklist",
  category: '["ops"]',
  tags: "[]",
  version: 7,
  content_version: 4,
  created_at: "2026-09-01T00:00:00.000Z",
  updated_at: "2026-09-02T00:00:00.000Z",
  items: JSON.stringify(sections),
  ...overrides,
});

const viewOf = (sections: unknown[], overrides: JsonRecord = {}) => templateView(row(sections, overrides));

const task = (id: string, textBytes = 100, text = "x") => ({
  id,
  title: `Task ${id}`,
  description: "",
  contents: [{ id: `${id}-text`, type: "text", value: text.repeat(Math.ceil(textBytes / text.length)).slice(0, textBytes) }],
});

const section = (id: string, tasks: JsonRecord[], title = `Section ${id}`) => ({ id, title, items: tasks });

// n sections of `tasks` tasks each, with `textBytes` of text per task.
const sections = (count: number, tasks: number, textBytes: number) =>
  Array.from({ length: count }, (_, s) =>
    section(`s${s}`, Array.from({ length: tasks }, (_, t) => task(`t${s}-${t}`, textBytes))));

const wholeOf = (view: TemplateView) => ({ ...view.header, sections: view.sections });

// Reads the whole template as a client receives it, checking every result against the bound.
async function readBack(view: TemplateView) {
  const read = await readTemplateInFull((args) => onWire(readTemplate(view, args as never)), String(view.header.id));
  for (const result of read.results) expect(resultBytes(result)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
  return read;
}

function toolErrorOf(action: () => unknown): ToolError {
  try {
    action();
  } catch (error) {
    if (error instanceof ToolError) return error;
    throw error;
  }
  throw new Error("expected a ToolError");
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

// Text that costs more inside JSON than it looks: escapes, control characters, several
// scripts, emoji (surrogate pairs) and a lone surrogate half.
const AWKWARD = 'He said "ship it" \\ now\n\ttabs\u0001\u001f · Ünïcödé 日本語テキスト 🚀🧪 \uD83D end';

describe("get_template results", () => {
  it("returns a template whole up to the bound, and an outline one byte over", () => {
    const sized = (textBytes: number) => viewOf([section("s1", [task("t1", textBytes)])]);
    const base = resultBytes(readTemplate(sized(0), {}));
    const atBound = readTemplate(sized(MAX_RESULT_BYTES - base), {});
    const overBound = readTemplate(sized(MAX_RESULT_BYTES - base + 1), {});

    expect(resultBytes(atBound)).toBe(MAX_RESULT_BYTES);
    expect(atBound).toEqual({ template: wholeOf(sized(MAX_RESULT_BYTES - base)) });
    expect(overBound.sectionsOmitted).toBe(true);
    expect(overBound).not.toHaveProperty("template.sections");
    expect(describeTemplateRead(atBound)).toBe('Loaded template "Release SOP".');
  });

  it("outlines a larger template: its fields and counts, and each section's id, title, tasks, and size", () => {
    const longTitle = `Launch ${"L".repeat(300)}`;
    const view = viewOf([...sections(3, 20, 1_000), section("long", [task("t-long")], longTitle)]);
    const outline = readTemplate(view, {});

    expect(outline).toEqual({
      template: {
        ...view.header,
        sectionCount: 4,
        taskCount: 61,
        bytes: resultBytes(view.sections),
      },
      sectionsOmitted: true,
      outline: view.sections.map((entry) => expect.objectContaining({
        id: entry.id,
        taskCount: (entry.items as unknown[]).length,
        bytes: resultBytes(entry),
      })),
      limit: MAX_RESULT_BYTES,
    });
    // Outline titles are cut; reading the section returns the whole title.
    const entry = (outline.outline as JsonRecord[])[3];
    expect(String(entry.title).length).toBeLessThanOrEqual(160);
    expect(String(entry.title).endsWith("…")).toBe(true);
    expect((readTemplate(view, { sectionId: "long" }).section as JsonRecord).title).toBe(longTitle);
    expect(describeTemplateRead(outline)).toBe(
      'Template "Release SOP" is too large to return at once, so this is its outline; read a section with sectionId.',
    );
  });

  it("pages an outline longer than one result and reads every section behind it", async () => {
    const view = viewOf(sections(600, 1, 150));
    const { template, results } = await readBack(view);

    const outlinePages = results.filter((result) => Array.isArray(result.outline));
    expect(outlinePages.length).toBeGreaterThan(1);
    expect(outlinePages.slice(0, -1).every((page) => typeof page.nextCursor === "string")).toBe(true);
    expect(outlinePages.at(-1)).not.toHaveProperty("nextCursor");
    // Only the first page carries the template's fields; the rest name it.
    expect(outlinePages[1].template).toEqual({ id: "template-1", version: 7, contentVersion: 4 });
    expect(describeTemplateRead(outlinePages[0])).toContain("More follows: call get_template with cursor set to nextCursor.");
    expect(template).toEqual(wholeOf(view));
  });

  it("returns a section that fits whole, as the template holds it", () => {
    const view = viewOf(sections(4, 20, 1_000));
    const result = readTemplate(view, { sectionId: "s2" });

    expect(result).toEqual({ template: { id: "template-1", version: 7, contentVersion: 4 }, section: view.sections[2] });
    expect(describeTemplateRead(result)).toBe('Loaded section "Section s2".');
  });

  it("pages a section too large for one result a run of whole tasks at a time, its fields first", async () => {
    const view = viewOf([section("big", Array.from({ length: 200 }, (_, index) => task(`t${index}`, 500)))]);
    const pages: JsonRecord[] = [readTemplate(view, { sectionId: "big" })];
    while (typeof pages.at(-1)?.nextCursor === "string") pages.push(readTemplate(view, { cursor: pages.at(-1)?.nextCursor as string }));

    expect(pages.length).toBeGreaterThan(3);
    const [first, second] = pages.map((page) => page.section as JsonRecord);
    expect(first).toMatchObject({ id: "big", title: "Section big", taskCount: 200, firstTask: 0 });
    expect(second).not.toHaveProperty("title");
    expect(second).toMatchObject({ id: "big", taskCount: 200, firstTask: (first.items as unknown[]).length });
    expect(pages.flatMap((page) => (page.section as JsonRecord).items as JsonRecord[])).toEqual(view.sections[0].items);
    for (const page of pages) expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
    expect(describeTemplateRead(pages[1])).toMatch(/^Loaded tasks \d+-\d+ of the 200 in a section too large for one result\. More follows/);
  });

  it("returns a task too large for one result in parts whose text joins into it", () => {
    const huge = { ...task("huge", 100_000, AWKWARD), description: AWKWARD.repeat(50) };
    const view = viewOf([section("s1", [task("small"), huge, task("after")])]);
    const pages: JsonRecord[] = [readTemplate(view, { taskId: "huge" })];
    while (typeof pages.at(-1)?.nextCursor === "string") pages.push(readTemplate(view, { cursor: pages.at(-1)?.nextCursor as string }));

    expect(pages.length).toBeGreaterThan(3);
    for (const page of pages) {
      expect(resultBytes(page)).toBeLessThanOrEqual(MAX_RESULT_BYTES);
      expect(page).toMatchObject({ sectionId: "s1", part: { of: "task", index: 1 } });
      expect(page).not.toHaveProperty("task");
    }
    const text = pages.map((page) => (page.part as JsonRecord).text).join("");
    expect(JSON.parse(text)).toEqual(onWire((view.sections[0].items as JsonRecord[])[1]));
    expect(describeTemplateRead(pages[0])).toContain("join its parts' text in order");

    const small = readTemplate(view, { taskId: "small" });
    expect(small).toEqual({ template: { id: "template-1", version: 7, contentVersion: 4 }, sectionId: "s1", task: (view.sections[0].items as JsonRecord[])[0] });
    expect(describeTemplateRead(small)).toBe('Loaded task "Task small".');
  });

  it("reads back a template whose fields, section, ids, or titles alone exceed one result", async () => {
    const longId = `section-${"i".repeat(40_000)}`;
    const view = viewOf([
      section("s1", [task("t1")], `Long ${AWKWARD.repeat(1_500)}`),
      section(longId, [task("t2", 200)]),
      section("s3", [task("t3", 50_000, AWKWARD), task("t4"), task("t5", 40_000)]),
    ], { description: AWKWARD.repeat(1_200) });
    const { template, results } = await readBack(view);

    const parts = results.flatMap((result) => (result.part ? [(result.part as JsonRecord).of] : []));
    expect(new Set(parts)).toEqual(new Set(["template", "outline", "section", "task"]));
    // A frame leaves out an id too long to fit; the part that holds it carries it.
    expect(results.some((result) => (result.section as JsonRecord | undefined)?.id === longId)).toBe(false);
    expect(template).toEqual(onWire(wholeOf(view)));
  });

  it("keeps every result within the bound and reads any template back in full", async () => {
    for (let seed = 1; seed <= 24; seed += 1) {
      const next = random(seed);
      const pick = (max: number) => Math.floor(next() * max);
      const text = (max: number) => {
        const length = pick(max);
        const source = next() < 0.3 ? AWKWARD : "Check the release notes and the rollback plan. ";
        return source.repeat(Math.ceil(length / source.length) + 1).slice(0, length);
      };
      const generated = Array.from({ length: 1 + pick(seed % 3 === 0 ? 120 : 30) }, (_, s) => ({
        id: `s${s}`,
        title: text(next() < 0.05 ? 3_000 : 60) || "Untitled section",
        items: Array.from({ length: 1 + pick(next() < 0.1 ? 60 : 6) }, (_, t) => ({
          id: `s${s}-t${t}`,
          title: text(80) || "Task",
          description: text(next() < 0.05 ? 20_000 : 200),
          contents: [
            { id: `s${s}-t${t}-c`, type: "text", value: text(next() < 0.01 ? 90_000 : 800) },
            { id: `s${s}-t${t}-d`, type: "subItems", value: "", subItems: [{ id: `s${s}-t${t}-x`, title: text(40) || "Sub-task" }] },
          ],
        })),
      }));
      const view = viewOf(generated, { description: text(4_000) });
      const { template, results } = await readBack(view);

      expect(template, `seed ${seed}`).toEqual(onWire(wholeOf(view)));
      expect(results.every((result) => resultBytes(result) <= MAX_RESULT_BYTES), `seed ${seed}`).toBe(true);
    }
  }, 60_000);
});

describe("get_template cursors and ids", () => {
  const view = viewOf([section("big", Array.from({ length: 200 }, (_, index) => task(`t${index}`, 500))), section("s2", [task("x")])]);
  const cursor = readTemplate(view, { sectionId: "big" }).nextCursor as string;

  it("continues a read from the version it started on, and fails with edit_conflict after a change", () => {
    expect(readTemplate(view, { cursor })).toHaveProperty("section.firstTask");
    // Passing the section it reads is allowed; another is not.
    expect(readTemplate(view, { cursor, sectionId: "big" })).toHaveProperty("section.firstTask");

    const changed = templateView(row(JSON.parse(JSON.stringify([view.sections[0], view.sections[1]])), { version: 8 }));
    const error = toolErrorOf(() => readTemplate(changed, { cursor }));
    expect(error.code).toBe("edit_conflict");
    expect(error.details).toEqual({ expectedVersion: 7, currentVersion: 8 });
  });

  it.each([
    ["a value it did not make", () => readTemplate(view, { cursor: "not-a-cursor" })],
    ["another template's cursor", () => readTemplate(viewOf(view.sections, { id: "template-2" }), { cursor })],
    ["a cursor with another section", () => readTemplate(view, { cursor, sectionId: "s2" })],
    ["a cursor with a task", () => readTemplate(view, { cursor, taskId: "t0" })],
    ["a cursor past the end", () => {
      const decoded = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as JsonRecord;
      return readTemplate(view, { cursor: Buffer.from(JSON.stringify({ ...decoded, u: 5_000 })).toString("base64url") });
    }],
  ])("refuses %s as invalid arguments", (_name, action) => {
    const error = toolErrorOf(action);
    expect(error.code).toBe("invalid_arguments");
    expect(error.message).toMatch(/^cursor: /);
  });

  it("names the id it cannot find", () => {
    expect(toolErrorOf(() => readTemplate(view, { sectionId: "missing" }))).toMatchObject({
      code: "section_not_found",
      message: "Section not found (sectionId)",
    });
    expect(toolErrorOf(() => readTemplate(view, { taskId: "missing" }))).toMatchObject({
      code: "task_not_found",
      message: "Task not found (taskId)",
    });
    expect(toolErrorOf(() => readTemplate(view, { taskId: "x", sectionId: "big" }))).toMatchObject({
      code: "task_not_found",
      message: "Task not found (taskId in sectionId)",
    });
    expect(readTemplate(view, { taskId: "x", sectionId: "s2" })).toHaveProperty("task.id", "x");
  });
});

describe("template write results", () => {
  const big = viewOf([
    section("s1", Array.from({ length: 120 }, (_, index) => task(`t${index}`, 400))),
    section("s2", [task("u1")]),
  ]);

  it("returns the whole template when it fits, naming what an operation changed", () => {
    const small = viewOf([section("s1", [task("t1")])]);

    expect(writtenTemplateResult(small)).toEqual({ template: wholeOf(small) });
    expect(writtenTemplateResult(small, { taskId: "t1" })).toEqual({ template: wholeOf(small), sectionId: "s1", taskId: "t1" });
  });

  it("returns the template's fields and the changed task or section of a larger one", () => {
    expect(writtenTemplateResult(big, { taskId: "t5" })).toEqual({
      template: big.header,
      sectionsOmitted: true,
      sectionId: "s1",
      taskId: "t5",
      task: (big.sections[0].items as JsonRecord[])[5],
    });
    expect(writtenTemplateResult(big, { sectionId: "s2" })).toEqual({
      template: big.header,
      sectionsOmitted: true,
      sectionId: "s2",
      section: big.sections[1],
    });
    // A section too large for the result is named, not returned.
    expect(writtenTemplateResult(big, { sectionId: "s1" })).toEqual({ template: big.header, sectionsOmitted: true, sectionId: "s1" });
    expect(writtenTemplateResult(big)).toEqual({ template: big.header, sectionsOmitted: true });
  });

  it("falls back to the template's id, title, and version when even its fields do not fit", () => {
    const legacy = viewOf(big.sections, { description: "d".repeat(40_000) });
    const minimal = { id: "template-1", title: "Release SOP", version: 7, contentVersion: 4 };

    expect(writtenTemplateResult(legacy)).toEqual({ template: minimal, sectionsOmitted: true });
    expect(writtenTemplateResult(legacy, { taskId: "t5" })).toEqual({
      template: minimal,
      sectionsOmitted: true,
      sectionId: "s1",
      taskId: "t5",
      task: (legacy.sections[0].items as JsonRecord[])[5],
    });
  });
});
