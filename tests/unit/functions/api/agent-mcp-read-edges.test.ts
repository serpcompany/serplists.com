import { describe, expect, it } from "vitest";
import { encodeCursor, MAX_RESULT_BYTES } from "@functions/api/handlers/agentMcpPages";
import {
  describeTemplateRead,
  readTemplate as readTemplateResult,
  templateView,
  writtenTemplateResult,
} from "@functions/api/handlers/agentMcpTemplatePages";
import { readRun as readRunResult, runView, updatedRunResult } from "@functions/api/handlers/agentMcpRunPages";
import { expectAnInvalidCursor, resultBytes, toolErrorOf } from "../../../support/agentMcp";
import { recordIn, recordsIn, textIn } from "../../../support/mcpResponses";
import { objectContaining } from "../../../support/asymmetricMatchers";
import type { PagedResult } from "../../../support/templatePages";

type JsonRecord = Record<string, unknown>;

const readTemplate = (...args: Parameters<typeof readTemplateResult>): PagedResult => readTemplateResult(...args);
const readRun = (...args: Parameters<typeof readRunResult>): PagedResult => readRunResult(...args);

const TEMPLATE_REF = { id: "template-1", version: 7, contentVersion: 4 };

const viewOf = (sections: JsonRecord[], id = "template-1") =>
  templateView({ id, title: "Release SOP", version: 7, content_version: 4, items: JSON.stringify(sections) });

const small = { id: "t1", title: "Check the notes" };
const other = { id: "t2", title: "Tag the release" };
const view = viewOf([{ id: "s1", title: "Ship", items: [small, other] }]);

const RUN_REF = { id: "run-1", revision: 5 };

const runOf = (sections: JsonRecord[], retired: JsonRecord[] = [], title = "Release run") =>
  runView({ id: "run-1", title, revision: 5, items: JSON.stringify(sections), retired_items: JSON.stringify(retired) });

const cursorAt = (position: JsonRecord) => encodeCursor({ t: "template-1", v: 7, u: 0, o: 0, ...position });

describe("get_template cursors that no read of it returned", () => {
  const taskCursor = cursorAt({ m: "task", s: 0, k: 0 });

  it("continues a task read from the task's start with the whole task when it fits one result", () => {
    expect(readTemplate(view, { cursor: taskCursor })).toEqual({ template: TEMPLATE_REF, sectionId: "s1", task: small });
  });

  it("continues a task read passed with the task's own id, and refuses one passed with another task's", () => {
    expect(readTemplate(view, { cursor: taskCursor, taskId: "t1" })).toHaveProperty("task", small);
    expectAnInvalidCursor(() => readTemplate(view, { cursor: taskCursor, taskId: "t2" }));
  });

  it.each([
    ["a section past the last", { m: "section", s: 3 }],
    ["a task past the last of its section", { m: "task", s: 0, k: 5 }],
    ["retired work, which a template never has", { m: "retired" }],
  ])("refuses a cursor that points at %s", (_name, position) => {
    const error = toolErrorOf(() => readTemplate(view, { cursor: cursorAt(position) }));

    expect(error).toMatchObject({ code: "invalid_arguments", message: "cursor: It points past the end" });
  });
});

describe("get_template outlines", () => {
  const description = "d".repeat(MAX_RESULT_BYTES);

  it("outlines a section stored without a title with a null title", () => {
    const outline = readTemplate(viewOf([{ id: "s1", items: [{ id: "t1", title: "Long", description }] }]), {});

    expect(outline.sectionsOmitted).toBe(true);
    expect(recordsIn(outline.outline)).toEqual([objectContaining({ id: "s1", title: null, taskCount: 1 })]);
  });

  it("describes a part of an outline entry too large for one result as part of an outline", () => {
    const longId = `section-${"i".repeat(40_000)}`;
    const large = viewOf([{ id: longId, title: "Long", items: [{ id: "t1", title: "Long", description }] }]);
    const first = readTemplate(large, {});

    const second = readTemplate(large, { cursor: textIn(first.nextCursor) });

    expect(recordIn(second.part)).toMatchObject({ of: "outline", index: 0, from: 0 });
    expect(describeTemplateRead(second)).toBe(
      "Loaded part of an outline too large for one result; join its parts' text in order."
        + " More follows: call get_template with cursor set to nextCursor.",
    );
  });
});

describe("template write results", () => {
  it("returns the template's id, title, and version even when not even those fit one result", () => {
    const longId = `template-${"i".repeat(MAX_RESULT_BYTES)}`;
    const result = writtenTemplateResult(viewOf([{ id: "s1", title: "Ship", items: [small] }], longId), { taskId: "t1" });

    expect(result).toEqual({ template: { id: longId, title: "Release SOP", version: 7, contentVersion: 4 }, sectionsOmitted: true });
    expect(resultBytes(result)).toBeGreaterThan(MAX_RESULT_BYTES);
  });
});

describe("get_run retired work narrowed to a task", () => {
  const notes = "n".repeat(15_000);
  const retiredCopies = [1, 2, 3].map((copy) => ({ kind: "item", sectionId: `s${copy}`, item: { id: "dns", title: "DNS", notes } }));
  const run = runOf([{ id: "s1", title: "Ship", items: [small] }], retiredCopies);

  it("pages a task's retired work too large for one result, its cursor continuing that task's read", () => {
    const first = readRun(run, { retired: true, taskId: "dns" });
    const cursor = textIn(first.nextCursor);

    expect(first).toMatchObject({ run: RUN_REF, retiredCount: 3, firstRetired: 0 });
    expect(readRun(run, { cursor, retired: true, taskId: "dns" })).toMatchObject({ run: RUN_REF, firstRetired: recordsIn(first.retiredItems).length });
    expectAnInvalidCursor(() => readRun(run, { cursor, retired: true, taskId: "t1" }));
  });
});

describe("run update results", () => {
  const sections = [{ id: "s1", title: "Ship", items: [small] }];

  it("returns a run's id, cut title, status, progress, and revision when its fields alone are too large for one result", () => {
    const { header } = runOf(sections, [], "T".repeat(MAX_RESULT_BYTES));
    const statusUpdate = { runId: "run-1", expectedRevision: 5, operation: "set_run_status" as const, status: "in_progress" as const };

    expect(updatedRunResult(header, sections, statusUpdate)).toEqual({
      run: { id: "run-1", title: `${"T".repeat(159)}…`, status: "in_progress", progress: 0, revision: 5 },
    });
  });
});
