import { afterEach, beforeEach, describe, expect, it } from "vitest";
import "../../../support/mockedSession";
import { insertOwnedRun, openRunOwnerDatabase } from "../../../support/runOwnerOnSqlite";
import { callToolWithAFreshRunKey } from "../../../support/agentMcpOnSqlite";
import { recordIn, recordsIn } from "../../../support/mcpResponses";
import type { SqliteD1 } from "../../../support/sqlite-d1";

let database: SqliteD1;

async function toolResult(name: string, args: Record<string, unknown>) {
  const { result } = await callToolWithAFreshRunKey(database, name, args);
  expect(result.isError).toBeUndefined();
  return result.structuredContent;
}

const sectionsOf = (record: unknown) => recordsIn(recordIn(record).sections);

beforeEach(() => {
  database = openRunOwnerDatabase("[]");
});

afterEach(() => {
  database.sqlite.close();
});

describe("MCP reads of content stored before the API checked every write", () => {
  it("reads a Template whose stored content cannot be read as one with no sections, and starts an empty run from it", async () => {
    database.run("UPDATE templates SET items = 'not json' WHERE id = 'template-1'");

    expect(sectionsOf((await toolResult("get_template", { templateId: "template-1" })).template)).toEqual([]);
    expect(sectionsOf((await toolResult("start_run", { templateId: "template-1" })).run)).toEqual([]);
  });

  it("reads a Template section stored with no task list as one with no tasks", async () => {
    database.run("UPDATE templates SET items = ? WHERE id = 'template-1'", JSON.stringify([
      { id: "s1", title: "Packing", items: [{ id: "t1", title: "Tent" }] },
      { id: "s2", title: "Notes" },
    ]));

    const sections = sectionsOf((await toolResult("get_template", { templateId: "template-1" })).template);

    expect(sections.map(({ id, items }) => ({ id, tasks: recordsIn(items).length }))).toEqual([{ id: "s1", tasks: 1 }, { id: "s2", tasks: 0 }]);
  });

  it("reads a run whose stored content cannot be read as one with no sections, and a status and progress never stored as in progress at 0", async () => {
    insertOwnedRun(database, { id: "run-1", status: "in_progress", items: "not json" });
    database.run("UPDATE checklist_runs SET status = NULL, progress = NULL WHERE id = 'run-1'");

    const run = recordIn((await toolResult("get_run", { runId: "run-1" })).run);

    expect(run).toMatchObject({ id: "run-1", status: "in_progress", progress: 0 });
    expect(sectionsOf(run)).toEqual([]);
  });
});
