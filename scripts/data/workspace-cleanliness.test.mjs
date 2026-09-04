import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  captureWorkspaceMetadata,
  compareWorkspaceMetadata,
  evaluateWorkspaceCleanliness,
  parsePorcelainStatus,
} from "./workspace-cleanliness-lib.mjs";

describe("data regression workspace cleanliness", () => {
  it("records exact dirty paths and fails closed in CI", () => {
    const paths = parsePorcelainStatus([
      " M src/generated.ts",
      "?? unexpected.txt",
      "R  old.ts -> renamed.ts",
      "",
    ].join("\n"));

    expect(paths).toEqual([
      "src/generated.ts",
      "unexpected.txt",
      "old.ts -> renamed.ts",
    ]);
    expect(evaluateWorkspaceCleanliness({ ci: true, paths })).toEqual({
      dirty: true,
      paths,
      filesystemChanges: [],
      unexpectedFilesystemChanges: [],
      verdict: "fail",
    });
  });

  it("permits ignored evidence artifacts because porcelain status never reports them", () => {
    expect(evaluateWorkspaceCleanliness({ ci: true, paths: [] })).toEqual({
      dirty: false,
      paths: [],
      filesystemChanges: [],
      unexpectedFilesystemChanges: [],
      verdict: "pass",
    });
  });

  it("reports developer edits without making a local regression run fail", () => {
    expect(evaluateWorkspaceCleanliness({ ci: false, paths: ["scripts/data/local-edit.ts"] }))
      .toEqual({
        dirty: true,
        paths: ["scripts/data/local-edit.ts"],
        filesystemChanges: [],
        unexpectedFilesystemChanges: [],
        verdict: "not-enforced",
      });
  });

  it("fails CI for ignored env log tmp and broad cache outputs outside the exact allowlist", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "workspace-cleanliness-"));
    try {
      mkdirSync(path.join(repoRoot, ".git"));
      mkdirSync(path.join(repoRoot, "node_modules", "immutable-dependency"), { recursive: true });
      writeFileSync(path.join(repoRoot, "node_modules", "immutable-dependency", "ignored.txt"), "before");
      writeFileSync(path.join(repoRoot, "existing.log"), "before");
      const before = captureWorkspaceMetadata({ repoRoot });

      for (const [relativePath, value] of [
        [".env", "secret-placeholder"],
        ["agent.log", "log"],
        ["scratch.tmp", "tmp"],
        ["tmp/arbitrary/not-suite-owned.txt", "arbitrary"],
        ["out/cache.txt", "out"],
        [".next/cache.txt", "next"],
        ["coverage/coverage.json", "coverage"],
        [".codex/state.json", "codex"],
      ]) {
        mkdirSync(path.dirname(path.join(repoRoot, relativePath)), { recursive: true });
        writeFileSync(path.join(repoRoot, relativePath), value);
      }
      writeFileSync(path.join(repoRoot, "node_modules", "immutable-dependency", "ignored.txt"), "after");
      writeFileSync(path.join(repoRoot, "existing.log"), "modified-with-different-size");

      const changes = compareWorkspaceMetadata({
        before,
        after: captureWorkspaceMetadata({ repoRoot }),
      });
      const result = evaluateWorkspaceCleanliness({
        ci: true,
        paths: [],
        filesystemChanges: changes,
        allowedOutputRoots: [
          "tmp/data-reports/selected",
          "tests/test-results",
          "playwright-report",
          "dist",
          ".wrangler/smoke-state",
        ],
      });

      expect(result.verdict).toBe("fail");
      expect(result.unexpectedFilesystemChanges.map((change) => change.path)).toEqual([
        ".codex",
        ".codex/state.json",
        ".env",
        ".next",
        ".next/cache.txt",
        "agent.log",
        "coverage",
        "coverage/coverage.json",
        "existing.log",
        "out",
        "out/cache.txt",
        "scratch.tmp",
        "tmp/arbitrary",
        "tmp/arbitrary/not-suite-owned.txt",
      ]);
      expect(result.unexpectedFilesystemChanges.some((change) =>
        change.path.startsWith("node_modules/"),
      )).toBe(false);
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });

  it("allows only the exact suite-owned output roots", () => {
    const repoRoot = mkdtempSync(path.join(tmpdir(), "workspace-cleanliness-allowed-"));
    try {
      const before = captureWorkspaceMetadata({ repoRoot });
      const allowedFiles = [
        "tmp/data-reports/selected/report.json",
        "tests/test-results/result/trace.zip",
        "playwright-report/index.html",
        "dist/assets/app.js",
        ".wrangler/smoke-state/v3/d1/state.sqlite",
      ];
      for (const relativePath of allowedFiles) {
        mkdirSync(path.dirname(path.join(repoRoot, relativePath)), { recursive: true });
        writeFileSync(path.join(repoRoot, relativePath), "evidence");
      }
      const changes = compareWorkspaceMetadata({
        before,
        after: captureWorkspaceMetadata({ repoRoot }),
      });
      const result = evaluateWorkspaceCleanliness({
        ci: true,
        paths: [],
        filesystemChanges: changes,
        allowedOutputRoots: [
          "tmp/data-reports/selected",
          "tests/test-results",
          "playwright-report",
          "dist",
          ".wrangler/smoke-state",
        ],
      });

      expect(result.verdict).toBe("pass");
      expect(result.unexpectedFilesystemChanges).toEqual([]);
      expect(result.filesystemChanges.map((change) => change.path)).toEqual(expect.arrayContaining(allowedFiles));
    } finally {
      rmSync(repoRoot, { recursive: true, force: true });
    }
  });
});
