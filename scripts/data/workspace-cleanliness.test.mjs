import { mkdirSync, mkdtempSync, rmSync, writeFileSync, rmdirSync, existsSync, symlinkSync, readdirSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import {
  captureWorkspaceMetadata,
  compareWorkspaceMetadata,
  evaluateWorkspaceCleanliness,
  evaluateImmutableRunContext,
  parsePorcelainStatus,
  restorePreexistingEmptyWranglerTemp,
  createOwnedWorkspaceDirectory,
} from "./workspace-cleanliness-lib.mjs";

describe("data regression workspace cleanliness", () => {
  it('removes only newly created empty parents and refuses a replaced fixture directory', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'workspace-owned-parent-'));
    const parent = path.join(root, '.wrangler/rehearsals');
    try {
      const owned = createOwnedWorkspaceDirectory({ parent, prefix: 'vitest-' });
      owned.cleanup();
      expect(readdirSync(root)).toEqual([]);
      const replaced = createOwnedWorkspaceDirectory({ parent, prefix: 'vitest-' });
      renameSync(replaced.directory, `${replaced.directory}-retained`);
      symlinkSync(`${replaced.directory}-retained`, replaced.directory);
      expect(() => replaced.cleanup()).toThrow(/ownership/);
      expect(readdirSync(parent)).toHaveLength(2);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('retains new sibling resources and refuses a replaced parent without touching its target', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'workspace-owned-sibling-'));
    const parent = path.join(root, 'rehearsals');
    try {
      const owned = createOwnedWorkspaceDirectory({ parent, prefix: 'vitest-' });
      writeFileSync(path.join(parent, 'roundtrip-other-invocation'), 'retain');
      owned.cleanup();
      expect(readdirSync(parent)).toEqual(['roundtrip-other-invocation']);
      const replaced = createOwnedWorkspaceDirectory({ parent, prefix: 'vitest-' });
      renameSync(parent, `${parent}-retained`);
      symlinkSync(`${parent}-retained`, parent);
      expect(() => replaced.cleanup()).toThrow(/ownership/);
      expect(existsSync(replaced.directory)).toBe(true);
      expect(() => createOwnedWorkspaceDirectory({ parent, prefix: 'vitest-' })).toThrow(/ownership/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('cleans only its invocation directory and preserves retained matching directories files and symlinks', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'workspace-owned-'));
    const parent = path.join(root, '.wrangler/rehearsals');
    try {
      mkdirSync(parent, { recursive: true });
      mkdirSync(path.join(parent, 'roundtrip-user-retained'));
      writeFileSync(path.join(parent, 'roundtrip-user-retained/evidence'), 'retain');
      mkdirSync(path.join(parent, 'vitest-previous-evidence'));
      writeFileSync(path.join(parent, 'vitest-file'), 'retain');
      symlinkSync('roundtrip-user-retained', path.join(parent, 'roundtrip-link'));
      symlinkSync('missing', path.join(parent, 'vitest-dangling'));
      const before = captureWorkspaceMetadata({ repoRoot: root });
      const owned = createOwnedWorkspaceDirectory({ parent, prefix: 'vitest-' });
      writeFileSync(path.join(owned.directory, 'fixture'), 'disposable');
      owned.cleanup();
      owned.cleanup();
      expect(compareWorkspaceMetadata({ before, after: captureWorkspaceMetadata({ repoRoot: root }) })).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('restores only preexisting empty Wrangler scaffolding', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wrangler-scaffold-'));
    const directory = path.join(root, '.wrangler/tmp');
    try {
      mkdirSync(directory, { recursive: true });
      const before = captureWorkspaceMetadata({ repoRoot: root });
      rmdirSync(directory);
      expect(restorePreexistingEmptyWranglerTemp({ repoRoot: root, before })).toBe(true);
      expect(compareWorkspaceMetadata({ before, after: captureWorkspaceMetadata({ repoRoot: root }) })).toEqual([]);
      writeFileSync(path.join(directory, 'owned.txt'), 'must not hide loss');
      const nonempty = captureWorkspaceMetadata({ repoRoot: root });
      rmSync(directory, { recursive: true });
      expect(restorePreexistingEmptyWranglerTemp({ repoRoot: root, before: nonempty })).toBe(false);
      expect(existsSync(directory)).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it('does not follow a replaced Wrangler parent symlink', () => {
    const root = mkdtempSync(path.join(tmpdir(), 'wrangler-scaffold-link-'));
    const outside = mkdtempSync(path.join(tmpdir(), 'wrangler-scaffold-outside-'));
    try {
      mkdirSync(path.join(root, '.wrangler/tmp'), { recursive: true });
      const before = captureWorkspaceMetadata({ repoRoot: root });
      rmSync(path.join(root, '.wrangler'), { recursive: true });
      symlinkSync(outside, path.join(root, '.wrangler'));
      expect(restorePreexistingEmptyWranglerTemp({ repoRoot: root, before })).toBe(false);
      expect(readdirSync(outside)).toEqual([]);
    } finally { rmSync(root, { recursive: true, force: true }); rmSync(outside, { recursive: true, force: true }); }
  });
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
    expect(evaluateWorkspaceCleanliness({ paths })).toEqual({
      dirty: true,
      paths,
      filesystemChanges: [],
      unexpectedFilesystemChanges: [],
      verdict: "fail",
    });
  });

  it("permits ignored evidence artifacts because porcelain status never reports them", () => {
    expect(evaluateWorkspaceCleanliness({ paths: [] })).toEqual({
      dirty: false,
      paths: [],
      filesystemChanges: [],
      unexpectedFilesystemChanges: [],
      verdict: "pass",
    });
  });

  it("allows dirty developer runs only through explicit non-gating mode", () => {
    expect(evaluateWorkspaceCleanliness({ nonGating: true, paths: ["scripts/data/local-edit.ts"] }))
      .toEqual({
        dirty: true,
        paths: ["scripts/data/local-edit.ts"],
        filesystemChanges: [],
        unexpectedFilesystemChanges: [],
        verdict: "warning",
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

  it("deterministically fails a concurrent HEAD move and worktree mutation", () => {
    const result = evaluateImmutableRunContext({ startCommit: "a".repeat(40), endCommit: "b".repeat(40), startPaths: [], endPaths: ["scripts/data/concurrent-edit.mjs"] });
    expect(result.verdict).toBe("fail");
    expect(result.failures).toEqual(expect.arrayContaining([expect.stringMatching(/HEAD changed/), expect.stringMatching(/concurrent-edit/)]));
    expect(evaluateImmutableRunContext({ ...result, nonGating: true }).verdict).toBe("warning");
  });
});
