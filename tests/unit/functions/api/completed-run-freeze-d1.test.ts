import { afterEach, beforeEach, describe, expect, it } from "vitest";
import {
  checklistsRefusal,
  insertOwnedRun,
  openRunOwnerDatabase,
  storedValue,
  updateRunRefusal,
} from "../../../support/runOwnerOnSqlite";

import { buildRunUpdatePayload } from "@/contexts/runUpdatePayload";
import { mapChecklistToRun } from "@/features/run-execution/runExecutionMappers";
import type { ChecklistSection } from "@/types/checklist";
import { COMPLETED_RUN_FROZEN_MESSAGE } from "@functions/api/utils/completed-run-freeze";
import { apiRequest } from "../../../support/apiRequest";
import { objectContaining } from "../../../support/asymmetricMatchers";
import { taskIn } from "../../../support/elements";
import { storedSectionsIn } from "../../../support/storedJson";
import type { SqliteD1 } from "../../../support/sqlite-d1";

type Ticks = { build?: boolean; check?: boolean; ship?: boolean; shipNotes?: string };

const sectionsWith = ({ build = true, check = true, ship = true, shipNotes }: Ticks = {}) => [{
  id: "s1",
  title: "Release",
  items: [
    {
      id: "build",
      title: "Build",
      isCompleted: build,
      contents: [{ type: "subItems", value: "", subItems: [{ id: "check", title: "Check", isCompleted: check }] }],
    },
    { id: "ship", title: "Ship", isCompleted: ship, ...(shipNotes === undefined ? {} : { notes: shipNotes }) },
  ],
}];

const COMPLETED_ITEMS = JSON.stringify(sectionsWith());

type Change = { sections: unknown; shared: unknown; mcp: Record<string, unknown> };

const untickATask: Change = {
  sections: sectionsWith({ ship: false }),
  shared: [{ id: "s1", items: [{ id: "ship", isCompleted: false }] }],
  mcp: { operation: "set_task_completed", taskId: "ship", completed: false },
};

const changes: Array<Change & { change: string }> = [
  { change: "untick a task", ...untickATask },
  {
    change: "untick a Sub-task",
    sections: sectionsWith({ build: false, check: false }),
    shared: [{ id: "s1", items: [{ id: "build", contents: [{ type: "subItems", subItems: [{ id: "check", isCompleted: false }] }] }] }],
    mcp: { operation: "set_subtask_completed", taskId: "build", subtaskId: "check", completed: false },
  },
];

const tickItAlreadyHolds: Change = {
  sections: sectionsWith(),
  shared: [{ id: "s1", items: [{ id: "ship", isCompleted: true }] }],
  mcp: { operation: "set_task_completed", taskId: "ship", completed: true },
};

const notes: Change = {
  sections: sectionsWith({ shipNotes: "Shipped" }),
  shared: [{ id: "s1", items: [{ id: "ship", notes: "Shipped" }] }],
  mcp: { operation: "set_task_notes", taskId: "ship", notes: "Shipped" },
};

let database: SqliteD1;

const put = (runId: string, body: unknown) => checklistsRefusal(database, apiRequest(`checklists/${runId}`, "PUT", body));

const httpRefusal = { status: 409, code: "run_completed", message: COMPLETED_RUN_FROZEN_MESSAGE };
const mcpRefusal = {
  status: "tool error",
  code: "run_completed",
  message: "Run is completed, so its tasks and subtasks can no longer be changed; set_run_status in_progress reopens it",
};

const routes = [
  {
    route: "PUT /api/checklists/:id",
    send: (change: Change) => put("done", { status: "completed", sections: change.sections, expected_revision: 1 }),
    refused: httpRefusal,
    sameTick: null,
  },
  {
    route: "PUT /api/checklists/shared/:token",
    send: (change: Change) =>
      checklistsRefusal(database, apiRequest("checklists/shared/token-done", "PUT", { status: "completed", sections: change.shared, expected_revision: 1 })),
    refused: httpRefusal,
    sameTick: null,
  },
  {
    route: "MCP update_run",
    send: (change: Change) => updateRunRefusal(database, { runId: "done", expectedRevision: 1, ...change.mcp }),
    refused: mcpRefusal,
    sameTick: objectContaining(mcpRefusal),
  },
];

const stored = (column: string, runId = "done") =>
  storedValue(database, `SELECT ${column} AS value FROM checklist_runs WHERE id = ?`, runId);
const auditRows = () => storedValue(database, "SELECT count(*) AS value FROM audit_events WHERE resource_id = 'done'");
const shipTask = () => taskIn(storedSectionsIn(stored("items")), 0, 1);

beforeEach(() => {
  database = openRunOwnerDatabase(COMPLETED_ITEMS);
  insertOwnedRun(database, { id: "done", status: "completed", items: COMPLETED_ITEMS, shareToken: "token-done" });
});

afterEach(() => {
  database.close();
});

describe.each(routes)("a completed run's tasks are frozen through $route", ({ send, refused, sameTick }) => {
  it.each(changes)("refuses a save that would $change, and writes nothing", async (change) => {
    await expect(send(change)).resolves.toEqual(expect.objectContaining(refused));

    expect(stored("items")).toBe(COMPLETED_ITEMS);
    expect(stored("revision")).toBe(1);
    expect(auditRows()).toBe(0);
  });

  it("answers a tick the run already holds as the route answers any save that changes no completion", async () => {
    await expect(send(tickItAlreadyHolds)).resolves.toEqual(sameTick);
  });

  it("keeps task notes editable", async () => {
    await expect(send(notes)).resolves.toBeNull();

    expect(shipTask()).toEqual(expect.objectContaining({ isCompleted: true, notes: "Shipped" }));
    expect(stored("status")).toBe("completed");
    expect(stored("revision")).toBe(2);
  });
});

describe("reopening is the status change back to in_progress", () => {
  it("holds a PUT that sends no status to the freeze, since the run stays completed", async () => {
    await expect(put("done", { sections: untickATask.sections, expected_revision: 1 })).resolves.toEqual(expect.objectContaining(httpRefusal));
  });

  it("reopens through PUT at the current revision, records it, and then takes task changes", async () => {
    await expect(put("done", { status: "in_progress", expected_revision: 1 })).resolves.toBeNull();
    expect(stored("status")).toBe("in_progress");
    expect(auditRows()).toBe(1);

    await expect(put("done", { status: "in_progress", sections: untickATask.sections, expected_revision: 2 })).resolves.toBeNull();
    expect(shipTask().isCompleted).toBe(false);
  });

  it("takes task changes in the PUT that reopens the run", async () => {
    await expect(put("done", { status: "in_progress", sections: untickATask.sections, expected_revision: 1 })).resolves.toBeNull();

    expect(stored("status")).toBe("in_progress");
    expect(shipTask().isCompleted).toBe(false);
  });

  it("refuses a reopen sent at an older revision with edit_conflict", async () => {
    database.run("UPDATE checklist_runs SET revision = 2 WHERE id = 'done'");

    await expect(put("done", { status: "in_progress", expected_revision: 1 })).resolves.toEqual(
      expect.objectContaining({ status: 409, code: "edit_conflict" }),
    );
    expect(stored("status")).toBe("completed");
  });

  it("reopens over MCP with set_run_status, after which set_task_completed works again", async () => {
    await expect(updateRunRefusal(database, { runId: "done", expectedRevision: 1, operation: "set_run_status", status: "in_progress" }))
      .resolves.toBeNull();

    await expect(updateRunRefusal(database, { runId: "done", expectedRevision: 2, ...untickATask.mcp })).resolves.toBeNull();
    expect(shipTask().isCompleted).toBe(false);
  });
});

describe("the run page's own saves of a completed legacy run, whose shapes the page normalizes", () => {
  const legacyItems = JSON.stringify([
    "A task stored as text",
    { title: "No id", completed: true },
    {
      id: "with-sub-tasks",
      title: "Sub-tasks",
      isCompleted: true,
      contents: [{ type: "subItems", subItems: ["Text Sub-task", null, { id: 7, title: "Numeric id", completed: true }, { title: "No id", isCompleted: true }] }],
    },
  ]);

  const pageRun = () => mapChecklistToRun({ id: "legacy", status: "completed", items: legacyItems, revision: 1 }, "legacy");

  const saveFromThePage = (edit: (section: ChecklistSection) => ChecklistSection) =>
    put("legacy", buildRunUpdatePayload({ ...pageRun(), sections: pageRun().sections.map(edit) }));

  beforeEach(() => {
    insertOwnedRun(database, { id: "legacy", status: "completed", items: legacyItems });
  });

  it("saves a note", async () => {
    await expect(saveFromThePage((section) => ({
      ...section,
      items: section.items.map((item) => ({ ...item, notes: "Checked" })),
    }))).resolves.toBeNull();

    expect(stored("revision", "legacy")).toBe(2);
  });

  it("refuses unticking Sub-tasks stored without a text id", async () => {
    await expect(saveFromThePage((section) => ({
      ...section,
      items: section.items.map((item) => ({
        ...item,
        contents: item.contents?.map((content) => ({
          ...content,
          subItems: content.subItems?.map((subItem) => ({ ...subItem, isCompleted: false })),
        })),
      })),
    }))).resolves.toEqual(expect.objectContaining(httpRefusal));
  });
});
