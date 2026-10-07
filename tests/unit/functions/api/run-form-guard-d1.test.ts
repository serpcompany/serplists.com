import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { z } from "zod";
import {
  checklistsRefusal,
  insertOwnedRun,
  openRunOwnerDatabase,
  storedValue,
  updateRunRefusal,
} from "../../../support/runOwnerOnSqlite";

import { FORM_INCOMPLETE_MESSAGE } from "@functions/api/utils/run-form-guard";
import { getTaskFormFields } from "@/lib/schemas/storedSections";
import { apiRequest } from "../../../support/apiRequest";
import { taskIn } from "../../../support/elements";
import { storedSectionsIn } from "../../../support/storedJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

type JsonRecord = Record<string, unknown>;

const nameField = (extra: JsonRecord = {}) => ({ id: "field_name", label: "Client name", kind: "text", required: true, ...extra });
const emailField = (extra: JsonRecord = {}) => ({ id: "field_email", label: "Email", kind: "email", required: false, ...extra });

const sectionsWith = ({ done = false, fields = [nameField(), emailField()] }: { done?: boolean; fields?: JsonRecord[] } = {}) => [{
  id: "s1",
  title: "Kickoff",
  items: [
    { id: "brief", title: "Collect the brief", isCompleted: done, contents: [{ id: "c1", type: "form", value: "", fields }] },
    { id: "plain", title: "Plain task", isCompleted: false },
  ],
}];

const STORED_ITEMS = JSON.stringify(sectionsWith());

let database: SqliteD1;

const put = (body: unknown, runId = "open") => checklistsRefusal(database, apiRequest(`checklists/${runId}`, "PUT", body));
const putShared = (body: unknown) => checklistsRefusal(database, apiRequest("checklists/shared/token-open", "PUT", body));
const stored = (column: string, runId = "open") =>
  storedValue(database, `SELECT ${column} AS value FROM checklist_runs WHERE id = ?`, runId);
const storedBrief = () => taskIn(storedSectionsIn(stored("items")), 0, 0);

const refusal = (fields: JsonRecord[]) => ({
  status: 409,
  code: "form_incomplete",
  message: FORM_INCOMPLETE_MESSAGE,
  details: { fieldCount: fields.length, fields },
});

beforeEach(() => {
  database = openRunOwnerDatabase(STORED_ITEMS);
  insertOwnedRun(database, { id: "open", status: "in_progress", items: STORED_ITEMS, shareToken: "token-open" });
});

afterEach(() => {
  database.close();
});

describe("PUT /api/checklists/:id refuses to save a task as done while its form blocks it", () => {
  it("refuses an empty required field and an invalid answer, names them, and writes nothing", async () => {
    const sections = sectionsWith({ done: true, fields: [nameField(), emailField({ answer: "not an email" })] });

    await expect(put({ sections, expected_revision: 1 })).resolves.toEqual(refusal([
      { taskId: "brief", fieldId: "field_name", reason: "required" },
      { taskId: "brief", fieldId: "field_email", reason: "invalid" },
    ]));
    expect(stored("items")).toBe(STORED_ITEMS);
    expect(stored("revision")).toBe(1);
  });

  it("saves the task as done with valid answers, and stores them", async () => {
    const sections = sectionsWith({ done: true, fields: [nameField({ answer: "Acme" }), emailField({ answer: "ops@acme.test" })] });

    await expect(put({ sections, expected_revision: 1 })).resolves.toBeNull();
    expect(storedBrief().isCompleted).toBe(true);
    expect(getTaskFormFields(storedBrief()).map((field) => field.answer)).toEqual(["Acme", "ops@acme.test"]);
  });

  it("checks the stored field definitions, so dropping the form or the required flag from the payload does not pass", async () => {
    const withoutForm = [{ ...sectionsWith({ done: true }).at(0), items: [{ id: "brief", title: "Collect the brief", isCompleted: true }] }];
    const notRequired = sectionsWith({ done: true, fields: [nameField({ required: false }), emailField()] });
    const blocked = refusal([{ taskId: "brief", fieldId: "field_name", reason: "required" }]);

    await expect(put({ sections: withoutForm, expected_revision: 1 })).resolves.toEqual(blocked);
    await expect(put({ sections: notRequired, expected_revision: 1 })).resolves.toEqual(blocked);
  });

  it("refuses clearing a required answer on a done task, and lets a done task keep the answers it was done with", async () => {
    const done = sectionsWith({ done: true, fields: [nameField({ answer: "Acme" }), emailField()] });
    await expect(put({ sections: done, expected_revision: 1 })).resolves.toBeNull();

    await expect(put({ sections: sectionsWith({ done: true }), expected_revision: 2 }))
      .resolves.toEqual(refusal([{ taskId: "brief", fieldId: "field_name", reason: "required" }]));
    await expect(put({ title: "Renamed", sections: done, expected_revision: 2 })).resolves.toBeNull();
  });

  it("saves answers on a task that is not done, whatever they hold", async () => {
    const sections = sectionsWith({ fields: [nameField(), emailField({ answer: "draft" })] });

    await expect(put({ sections, expected_revision: 1 })).resolves.toBeNull();
    expect(getTaskFormFields(storedBrief()).map((field) => field.answer)).toEqual([undefined, "draft"]);
  });
});

describe("PUT /api/checklists/shared/:token keeps answers read-only and holds the same rule", () => {
  const tickTheBrief = (fields: JsonRecord[] = []) => ({
    sections: [{ id: "s1", items: [{ id: "brief", isCompleted: true, contents: [{ type: "form", fields }] }] }],
    expected_revision: 1,
  });

  it("refuses ticking a task whose stored form blocks it, even with answers sent along, and writes nothing", async () => {
    await expect(putShared(tickTheBrief([nameField({ answer: "Sent by a visitor" })])))
      .resolves.toEqual(refusal([{ taskId: "brief", fieldId: "field_name", reason: "required" }]));
    expect(stored("items")).toBe(STORED_ITEMS);
  });

  it("ignores answers a visitor sends with any other change", async () => {
    await expect(putShared({
      sections: [{ id: "s1", items: [{ id: "brief", notes: "Called the client", contents: [{ type: "form", fields: [nameField({ answer: "Visitor" })] }] }] }],
      expected_revision: 1,
    })).resolves.toBeNull();

    expect(storedBrief().notes).toBe("Called the client");
    expect(getTaskFormFields(storedBrief()).map((field) => field.answer)).toEqual([undefined, undefined]);
  });

  it("ticks a task whose stored form is filled in", async () => {
    const answered = JSON.stringify(sectionsWith({ fields: [nameField({ answer: "Acme" }), emailField()] }));
    database.run("UPDATE checklist_runs SET items = ? WHERE id = 'open'", answered);

    await expect(putShared(tickTheBrief())).resolves.toBeNull();
    expect(storedBrief().isCompleted).toBe(true);
    expect(getTaskFormFields(storedBrief()).map((field) => field.answer)).toEqual(["Acme", undefined]);
  });
});

describe("the other routes that tick tasks hold the same rule", () => {
  it("MCP set_task_completed refuses the same task with the same code", async () => {
    await expect(updateRunRefusal(database, { runId: "open", expectedRevision: 1, operation: "set_task_completed", taskId: "brief", completed: true }))
      .resolves.toEqual({
        status: "tool error",
        code: "form_incomplete",
        message: FORM_INCOMPLETE_MESSAGE,
        details: { fieldCount: 1, fields: [{ taskId: "brief", fieldId: "field_name", reason: "required" }] },
      });
  });
});

describe("MCP set_form_answer fills a form on the stored run", () => {
  const answer = (expectedRevision: number, fieldId: string, value: unknown) =>
    updateRunRefusal(database, { runId: "open", expectedRevision, operation: "set_form_answer", taskId: "brief", fieldId, answer: value });
  const tick = (expectedRevision: number) =>
    updateRunRefusal(database, { runId: "open", expectedRevision, operation: "set_task_completed", taskId: "brief", completed: true });
  const storedAnswers = () => getTaskFormFields(storedBrief()).map((field) => field.answer);
  const formAnswerAudits = () => database.sqlite
    .prepare("SELECT diff_json AS diff FROM audit_events WHERE resource_id = 'open' AND metadata_json LIKE '%set_form_answer%' ORDER BY created_at")
    .all();

  it("answers the form, refuses an invalid answer, and then lets set_task_completed tick the task", async () => {
    await expect(tick(1)).resolves.toEqual(expect.objectContaining({ code: "form_incomplete" }));

    await expect(answer(1, "field_name", "Acme")).resolves.toBeNull();
    await expect(answer(2, "field_email", "not an email")).resolves.toEqual({
      status: "tool error",
      code: "invalid_answer",
      message: "Enter an email address like name@example.com.",
      details: { taskId: "brief", fieldId: "field_email", kind: "email", reason: "invalid" },
    });
    expect(stored("revision")).toBe(2);
    await expect(answer(2, "field_email", "ops@acme.test")).resolves.toBeNull();
    expect(storedBrief().isCompleted).toBe(false);

    await expect(tick(3)).resolves.toBeNull();
    expect(storedBrief().isCompleted).toBe(true);
    expect(storedAnswers()).toEqual(["Acme", "ops@acme.test"]);
    expect(stored("revision")).toBe(4);

    const audits = formAnswerAudits();
    expect(audits).toHaveLength(2);
    for (const { diff } of z.array(z.object({ diff: z.string() })).parse(audits)) {
      expect(JSON.parse(diff)).toEqual(expect.objectContaining({ operation: "set_form_answer", taskId: "brief", answersChanged: ["brief"] }));
      expect(diff).not.toMatch(/Acme|ops@acme/);
    }
  });

  it("clears an answer with null, required or not, while the task is open", async () => {
    database.run("UPDATE checklist_runs SET items = ? WHERE id = 'open'", JSON.stringify(sectionsWith({ fields: [nameField({ answer: "Acme" }), emailField()] })));

    await expect(answer(1, "field_name", null)).resolves.toBeNull();

    expect(storedAnswers()).toEqual([undefined, undefined]);
    expect(storedBrief().isCompleted).toBe(false);
  });

  it("refuses an answer that is stale or on a completed run, and writes nothing", async () => {
    database.run("UPDATE checklist_runs SET revision = 2 WHERE id = 'open'");
    await expect(answer(1, "field_name", "Acme")).resolves.toEqual(expect.objectContaining({ code: "edit_conflict" }));

    database.run("UPDATE checklist_runs SET status = 'completed' WHERE id = 'open'");
    await expect(answer(2, "field_name", "Acme")).resolves.toEqual(expect.objectContaining({ code: "run_completed" }));

    expect(stored("items")).toBe(STORED_ITEMS);
    expect(storedValue(database, "SELECT count(*) AS value FROM audit_events WHERE resource_id = ?", "open")).toBe(0);
  });
});
