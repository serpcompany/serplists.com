import { getTableColumns } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { createDb, schema } from "@functions/api/db";
import {
  insertAuditWhenRunExists,
  insertRunUnderActiveRunLimit,
  personalActiveRunsWhere,
} from "@functions/api/utils/active-run-limit";

// The builders only render SQL here; nothing reaches D1.
const db = createDb({ DB: {} } as never);

function insertedColumns(sqlText: string): string[] {
  const list = /^insert into "\w+" \(([^)]*)\)/.exec(sqlText)?.[1] ?? "";
  return list.split(",").map((column) => column.trim().replace(/"/g, ""));
}

function selectedValues(sqlText: string): string[] {
  return (/select\s+(.*?)\s+where (?:\(|exists)/s.exec(sqlText)?.[1] ?? "").split(", ");
}

// Every provided value (null included) is a bound parameter, in column order. Missing
// columns render their default or a literal null instead.
function expectedValueParams(columns: string[], values: Record<string, unknown>): unknown[] {
  return columns.filter((column) => column in values).map((column) => values[column]);
}

const run = {
  id: "run-1",
  user_id: "user-1",
  team_id: null,
  template_id: "template-1",
  title: "Release SOP",
  items: "[]",
  status: "in_progress",
  progress: 0,
  started_at: "2026-09-28T00:00:00.000Z",
  completed_at: null,
  created_by_user_id: "user-1",
  started_by_user_id: "user-1",
  created_at: "2026-09-28T00:00:00.000Z",
  updated_at: "2026-09-28T00:00:00.000Z",
  template_version: 4,
  revision: 1,
  retired_items: "[]",
};

describe("active run limit guarded inserts", () => {
  it("selects one value per inserted column, in column order, then applies the limit", () => {
    const query = insertRunUnderActiveRunLimit(db, run, personalActiveRunsWhere("user-1"), 3).toSQL();
    const columns = insertedColumns(query.sql);

    expect(columns).toEqual(Object.values(getTableColumns(schema.checklist_runs)).map((column) => column.name));
    expect(selectedValues(query.sql)).toHaveLength(columns.length);
    // Values come first, in column order; the guard's user id, status, and limit follow.
    expect(query.params.slice(0, -3)).toEqual(expectedValueParams(columns, run));
    expect(query.params.slice(-3)).toEqual(["user-1", "in_progress", 3]);
    expect(query.sql).toMatch(/where \(select count\(\*\) from "checklist_runs" where .*"deleted_at" is null\)\) < \?$/s);
  });

  it("writes the audit event only when its run row exists", () => {
    const auditEvent = {
      id: "audit-1",
      actor_user_id: "user-1",
      subject_type: "user",
      subject_id: "user-1",
      resource_type: "checklist_run",
      resource_id: "run-1",
      action: "checklist_run.created",
      after_json: "{}",
      metadata_json: "{}",
      created_at: "2026-09-28T00:00:00.000Z",
    };
    const query = insertAuditWhenRunExists(db, auditEvent, "run-1").toSQL();

    const columns = insertedColumns(query.sql);
    expect(columns).toEqual(Object.values(getTableColumns(schema.audit_events)).map((column) => column.name));
    expect(selectedValues(query.sql)).toHaveLength(columns.length);
    expect(query.params).toEqual([...expectedValueParams(columns, auditEvent), "run-1"]);
    expect(query.sql).toMatch(/where exists \(select 1 from "checklist_runs" where "checklist_runs"\."id" = \?\)$/s);
  });
});
