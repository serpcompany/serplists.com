import { existsSync, mkdirSync, mkdtempSync, readFileSync, realpathSync, rmSync, writeFileSync, symlinkSync, renameSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { cleanupSmokeState, createSmokeWorkspace } from "./smoke-teardown-lib.mjs";

describe("smoke state teardown", () => {
  it("rejects the actual runner's shared tmp target even before D1 exists", () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "smoke-ownership-regression-")));
    const transientPath = path.join(root, '.wrangler/tmp');
    mkdirSync(transientPath, { recursive: true });
    const retained = path.join(transientPath, 'dev-worker-bundle.js');
    writeFileSync(retained, 'unrelated retained bundle');
    try {
      expect(() => cleanupSmokeState({
        repoRoot: root,
        statePath: path.join(root, '.wrangler/smoke-state'),
        transientPaths: [transientPath],
        reportPath: path.join(root, 'tmp/data-reports/browser-smoke-teardown.json'),
      })).toThrow();
      expect(readFileSync(retained, 'utf8')).toBe('unrelated retained bundle');
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
  it("removes isolated state and reports observed zero leaks", () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "smoke-teardown-")));
    const ownership = createSmokeWorkspace({ repoRoot: root });
    const statePath = ownership.statePath;
    const transientPath = path.join(ownership.root, '.wrangler/tmp');
    const reportPath = path.join(root, "tmp/data-reports/browser-smoke-teardown.json");
    mkdirSync(statePath, { recursive: true });
    writeFileSync(path.join(statePath, "state.sqlite"), "synthetic");
    mkdirSync(transientPath, { recursive: true });
    writeFileSync(path.join(transientPath, "bundle.js"), "synthetic");
    try {
      const report = cleanupSmokeState({
        repoRoot: root,
        statePath,
        transientPaths: ownership.transientPaths,
        ownership,
        reportPath,
      });
      expect(report).toMatchObject({
        existedBefore: true,
        existsAfter: false,
        leakedStatePaths: 0,
        transientIdentities: [path.relative(root, ownership.root)],
        verdict: "pass",
      });
      expect(existsSync(statePath)).toBe(false);
      expect(existsSync(transientPath)).toBe(false);
      expect(JSON.parse(readFileSync(reportPath, "utf8"))).toEqual(report);
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it("reports failure from observed remaining state instead of hard-coded zeros", () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), "smoke-teardown-fail-")));
    const ownership = createSmokeWorkspace({ repoRoot: root });
    const statePath = ownership.statePath;
    const reportPath = path.join(root, "tmp/data-reports/browser-smoke-teardown.json");
    mkdirSync(statePath, { recursive: true });
    try {
      const report = cleanupSmokeState({
        repoRoot: root,
        statePath,
        transientPaths: ownership.transientPaths,
        ownership,
        reportPath,
        remove: () => {},
      });
      expect(report).toMatchObject({ existsAfter: true, leakedStatePaths: 2, verdict: "fail" });
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it.each(['success', 'no-state', 'remove-throws', 'symlink', 'replacement', 'dangling-link'])('preserves unrelated and concurrent state on %s', mode => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'smoke-adversarial-')));
    const shared = path.join(root, '.wrangler/tmp');
    mkdirSync(shared, { recursive: true });
    writeFileSync(path.join(shared, 'retained'), 'preexisting');
    const ownership = createSmokeWorkspace({ repoRoot: root });
    const other = createSmokeWorkspace({ repoRoot: root });
    writeFileSync(path.join(other.root, 'concurrent'), 'concurrent');
    const args = { repoRoot: root, ownership, statePath: ownership.statePath,
      transientPaths: ownership.transientPaths, reportPath: path.join(root, 'tmp/data-reports/teardown.json') };
    try {
      if (mode !== 'no-state') mkdirSync(ownership.statePath);
      if (mode === 'symlink') symlinkSync(shared, path.join(ownership.root, 'link'));
      if (mode === 'replacement' || mode === 'dangling-link') {
        renameSync(ownership.root, ownership.root + '-moved');
        if (mode === 'replacement') mkdirSync(ownership.root);
        else symlinkSync(path.join(root, 'absent'), ownership.root);
      }
      if (mode === 'remove-throws') args.remove = () => { throw new Error('synthetic removal failure'); };
      const report = cleanupSmokeState(args);
      expect(report.verdict).toBe(['success', 'no-state'].includes(mode) ? 'pass' : 'fail');
      expect(readFileSync(path.join(shared, 'retained'), 'utf8')).toBe('preexisting');
      expect(readFileSync(path.join(other.root, 'concurrent'), 'utf8')).toBe('concurrent');
      if (report.verdict === 'pass') {
        expect(existsSync(ownership.root)).toBe(false);
        expect(cleanupSmokeState(args).verdict).toBe('pass');
      } else expect(report.leakedStatePaths).toBeGreaterThan(0);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it('rejects broad paths even with a genuine capability, and refuses symlink parents', () => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'smoke-reject-')));
    try {
      const ownership = createSmokeWorkspace({ repoRoot: root });
      const args = { repoRoot: root, ownership, statePath: ownership.statePath,
        transientPaths: ownership.transientPaths, reportPath: path.join(root, 'tmp/data-reports/teardown.json') };
      for (const target of [root, path.join(root, '.wrangler'), path.join(root, '.wrangler/tmp'), path.dirname(root)]) {
        expect(() => cleanupSmokeState({ ...args, transientPaths: [target] })).toThrow();
        expect(() => cleanupSmokeState({ ...args, statePath: target })).toThrow();
      }
      expect(cleanupSmokeState(args).verdict).toBe('pass');
      mkdirSync(path.join(root, 'elsewhere'));
      symlinkSync(path.join(root, 'elsewhere'), path.join(root, '.wrangler'));
      expect(() => createSmokeWorkspace({ repoRoot: root })).toThrow(/symlink/);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });

  it.each(['outside', 'symlink'])('still removes owned resources when the report path is %s', mode => {
    const root = realpathSync(mkdtempSync(path.join(tmpdir(), 'smoke-report-refusal-')));
    const ownership = createSmokeWorkspace({ repoRoot: root });
    try {
      const reportPath = mode === 'outside' ? path.join(root, 'outside.json') : path.join(root, 'tmp/data-reports/link/report.json');
      if (mode === 'symlink') {
        mkdirSync(path.join(root, 'tmp/data-reports'), { recursive: true });
        symlinkSync(root, path.join(root, 'tmp/data-reports/link'));
      }
      expect(() => cleanupSmokeState({ repoRoot: root, ownership, statePath: ownership.statePath,
        transientPaths: ownership.transientPaths, reportPath })).toThrow(/cleanup verdict=pass, leakedStatePaths=0/);
      expect(existsSync(ownership.root)).toBe(false);
      expect(existsSync(path.join(root, 'outside.json'))).toBe(false);
      expect(existsSync(path.join(root, 'report.json'))).toBe(false);
    } finally { rmSync(root, { recursive: true, force: true }); }
  });
});
