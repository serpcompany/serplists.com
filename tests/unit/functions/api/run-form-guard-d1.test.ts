import { afterEach, beforeEach, describe, expect, it } from "vitest";
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
