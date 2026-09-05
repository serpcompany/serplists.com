import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { writeDataCheckReports } from "./reporting.mjs";
import {
  buildDataRegressionReport,
  renderDataRegressionMarkdown,
} from "./data-regression-report-lib.mjs";

describe("data regression evidence report", () => {
  it("writes Markdown JSON and JUnit with identity migrations invariants and teardown", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "data-regression-report-"));
    try {
      const report = buildDataRegressionReport({
        commit: "0123456789abcdef0123456789abcdef01234567",
        workingTreeDirty: false,
        workingTreeDirtyPaths: [],
        workspaceCleanlinessVerdict: "pass",
        unexpectedFilesystemChanges: [],
        target: {
          environment: "local",
          databaseName: "serp-checklists-db",
          databaseId: "local:miniflare:DB@isolated-regression",
          binding: "DB",
        },
        migrationRange: {
          from: "0023_add_sitemap_revision_state.sql",
          to: "0024_safe_template_evolution.sql",
        },
        checks: [
          { name: "authenticated rows-present API-visible", verdict: "pass" },
          { name: "section item sub-item lifecycle matrix", verdict: "pass" },
          { name: "template and run optimistic concurrency", verdict: "pass" },
          { name: "rollback recovery rehearsal", verdict: "pass" },
        ],
        invariants: { changedCounts: 0, foreignKeyViolations: 0, invalidJson: 0 },
        teardown: { leakedUsers: 0, leakedTemplates: 0, leakedRuns: 0, leakedSmokeStatePaths: 0, verdict: "pass" },
        browserEvidence: { applicable: false, failureArtifacts: [] },
      });
      const markdown = renderDataRegressionMarkdown(report);
      const paths = writeDataCheckReports({
        name: "data-regression-suite",
        report,
        summary: markdown,
        reportDirectory: directory,
      });

      expect(report.verdict).toBe("pass");
      expect(readFileSync(paths.markdown, "utf8")).toContain("# Data regression suite: PASS");
      expect(JSON.parse(readFileSync(paths.json, "utf8"))).toMatchObject({
        target: { environment: "local", databaseId: "local:miniflare:DB@isolated-regression" },
        workingTreeDirty: false,
        workingTreeDirtyPaths: [],
        unexpectedFilesystemChanges: [],
        teardown: { verdict: "pass" },
      });
      expect(readFileSync(paths.junit, "utf8")).toContain('failures="0"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("writes explicit JUnit failures for teardown browser invariants and overall even when named checks pass", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "data-regression-failure-report-"));
    try {
      const report = buildDataRegressionReport({
        commit: "0123456789abcdef0123456789abcdef01234567",
        target: { environment: "local", databaseName: "db", databaseId: "local:db", binding: "DB" },
        migrationRange: { from: "0023_add_sitemap_revision_state.sql", to: "0024_safe_template_evolution.sql" },
        checks: [{ name: "authenticated visibility", verdict: "pass" }],
        invariants: { changedCounts: 1, foreignKeyViolations: 0, invalidJson: 0 },
        teardown: { leakedUsers: 1, leakedTemplates: 0, leakedRuns: 0, leakedSmokeStatePaths: 1, verdict: "fail" },
        browserEvidence: { applicable: true, verdict: "fail", failureArtifacts: ["trace.zip"] },
      });
      const paths = writeDataCheckReports({
        name: "data-regression-suite",
        report,
        summary: renderDataRegressionMarkdown(report),
        reportDirectory: directory,
      });
      const junit = readFileSync(paths.junit, "utf8");

      expect(report.verdict).toBe("fail");
      expect(junit).toMatch(/failures="[1-9][0-9]*"/);
      expect(junit).toContain('name="teardown verdict"');
      expect(junit).toContain('name="browser evidence verdict"');
      expect(junit).toContain('name="invariant verdict"');
      expect(junit).toContain('name="overall verdict"');
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });

  it("fails reports and JUnit when CI produced unexpected workspace changes", () => {
    const directory = mkdtempSync(path.join(tmpdir(), "data-regression-dirty-report-"));
    try {
      const report = buildDataRegressionReport({
        commit: "0123456789abcdef0123456789abcdef01234567",
        workingTreeDirty: true,
        workingTreeDirtyPaths: ["src/generated.ts"],
        workspaceCleanlinessVerdict: "fail",
        unexpectedFilesystemChanges: [{ path: ".env", change: "created" }],
        target: { environment: "local", databaseName: "db", databaseId: "local:db", binding: "DB" },
        migrationRange: { from: "0023_add_sitemap_revision_state.sql", to: "0024_safe_template_evolution.sql" },
        checks: [{ name: "named check", verdict: "pass" }],
        invariants: { changedCounts: 0, foreignKeyViolations: 0, invalidJson: 0 },
        teardown: { leakedUsers: 0, leakedTemplates: 0, leakedRuns: 0, leakedSmokeStatePaths: 0, verdict: "pass" },
        browserEvidence: { applicable: false, failureArtifacts: [] },
      });
      const paths = writeDataCheckReports({
        name: "data-regression-suite",
        report,
        summary: renderDataRegressionMarkdown(report),
        reportDirectory: directory,
      });
      const junit = readFileSync(paths.junit, "utf8");

      expect(report.verdict).toBe("fail");
      expect(report.workingTreeDirtyPaths).toEqual(["src/generated.ts"]);
      expect(report.unexpectedFilesystemChanges).toEqual([{ path: ".env", change: "created" }]);
      expect(junit).toContain('name="workspace cleanliness verdict"');
      expect(junit).toMatch(/failures="[1-9][0-9]*"/);
    } finally {
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
