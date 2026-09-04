import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cleanupSmokeState } from "./smoke-teardown-lib.mjs";

describe("smoke state teardown", () => {
  it("removes isolated state and reports observed zero leaks", () => {
    const root = mkdtempSync(path.join(tmpdir(), "smoke-teardown-"));
    const statePath = path.join(root, ".wrangler/smoke-state");
    const reportPath = path.join(root, "tmp/data-reports/browser-smoke-teardown.json");
    mkdirSync(statePath, { recursive: true });
    writeFileSync(path.join(statePath, "state.sqlite"), "synthetic");
    try {
      const report = cleanupSmokeState({ repoRoot: root, statePath, reportPath });
      expect(report).toMatchObject({
        existedBefore: true,
        existsAfter: false,
        leakedStatePaths: 0,
        verdict: "pass",
      });
      expect(existsSync(statePath)).toBe(false);
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toEqual(report);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports failure from observed remaining state instead of hard-coded zeros", () => {
    const root = mkdtempSync(path.join(tmpdir(), "smoke-teardown-fail-"));
    const statePath = path.join(root, ".wrangler/smoke-state");
    const reportPath = path.join(root, "tmp/data-reports/browser-smoke-teardown.json");
    mkdirSync(statePath, { recursive: true });
    try {
      const report = cleanupSmokeState({
        repoRoot: root,
        statePath,
        reportPath,
        remove: () => {},
      });
      expect(report).toMatchObject({ existsAfter: true, leakedStatePaths: 1, verdict: "fail" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });
});
