import { describe, expect, it } from "vitest";

import {
  compareMigrationSnapshots,
  runProductionShapedMigrationMatrix,
} from "./production-shaped-migration-matrix";

describe("production-shaped 0023 to 0024 migration matrix", () => {
  it("preserves row counts ownership active/deleted state foreign keys JSON and versions", () => {
    const report = runProductionShapedMigrationMatrix();

    expect(report.verdict).toBe("pass");
    expect(report.pre.rows).toEqual(report.post.rows);
    expect(report.pre.owners).toEqual(report.post.owners);
    expect(report.pre.activeDeleted).toEqual(report.post.activeDeleted);
    expect(report.post.foreignKeyViolations).toBe(0);
    expect(report.post.invalidJson).toBe(0);
    expect(report.post.templateVersions).toEqual([
      { id: "matrix-template-active", version: 4, contentVersion: 4 },
      { id: "matrix-template-deleted", version: 3, contentVersion: 3 },
    ]);
    expect(report.pre.preservationHash).toBe(report.post.preservationHash);
    expect(report.pre.preservedRows).toEqual(report.post.preservedRows);
  });

  it("fails exact comparison on an owner swap or frozen run data loss", () => {
    const report = runProductionShapedMigrationMatrix();
    const ownerSwap = structuredClone(report.post);
    ownerSwap.preservedRows.templates[0].userId = "matrix-owner-b";
    expect(compareMigrationSnapshots(report.pre, ownerSwap)).toMatchObject({ verdict: "fail" });

    const frozenLoss = structuredClone(report.post);
    const completed = frozenLoss.preservedRows.runs.find((run) => run.id === "matrix-run-completed");
    if (!completed) throw new Error("Completed matrix row missing");
    completed.note = "";
    completed.completedAt = null;
    expect(compareMigrationSnapshots(report.pre, frozenLoss)).toMatchObject({ verdict: "fail" });
  });

  it("preserves every existing section item and sub-item identity across 0024", () => {
    const report = runProductionShapedMigrationMatrix();

    expect(report.pre.identityHash).toBe(report.post.identityHash);
    expect(report.pre.identityRows).toEqual(report.post.identityRows);
    expect(report.post.identityRows.runs).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: "section", id: "matrix-section" }),
      expect.objectContaining({ kind: "item", id: "matrix-item" }),
      expect.objectContaining({ kind: "subItem", id: "matrix-sub-item" }),
    ]));

    const changedIdentity = structuredClone(report.post);
    changedIdentity.identityRows.runs[0].id = "unexpected-replacement";
    expect(compareMigrationSnapshots(report.pre, changedIdentity)).toMatchObject({ verdict: "fail" });
  });

  it("preserves multiple active runs at different completion progress and notes", () => {
    const report = runProductionShapedMigrationMatrix();

    expect(report.post.activeRuns).toEqual([
      expect.objectContaining({ id: "matrix-run-active-25", progress: 25, note: "note-25" }),
      expect.objectContaining({ id: "matrix-run-active-75", progress: 75, note: "note-75" }),
    ]);
  });

  it("keeps completed shared archived and stale lifecycle rows frozen and visible to recovery", () => {
    const report = runProductionShapedMigrationMatrix();

    expect(report.post.lifecycle).toEqual(expect.arrayContaining([
      expect.objectContaining({ id: "matrix-run-completed", status: "completed", isPublic: 0, deletedAt: null }),
      expect.objectContaining({ id: "matrix-run-shared", status: "in_progress", isPublic: 1, deletedAt: null }),
      expect.objectContaining({ id: "matrix-run-archived", status: "in_progress", isPublic: 0, deletedAt: "2026-09-01T00:00:00Z" }),
    ]));
    expect(report.post.lifecycle.every((run) => run.templateVersion === 0)).toBe(true);
  });
});
