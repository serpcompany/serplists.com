import { lstatSync, readdirSync, mkdirSync, mkdtempSync, rmSync, rmdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_EXCLUDED_ROOTS = [".git", "node_modules"];

/** Allocate a unique fixture directory; names of other entries never imply ownership. */
export function createOwnedWorkspaceDirectory({ parent, prefix }) {
  const parents = [];
  function ensureDirectory(name) {
    try {
      if (!lstatSync(name).isDirectory()) throw new Error('Workspace directory ownership requires a real directory.');
      return;
    } catch (error) { if (error.code !== 'ENOENT') throw error; }
    ensureDirectory(path.dirname(name));
    try {
      mkdirSync(name);
      parents.push([name, lstatSync(name)]);
    } catch (error) {
      if (error.code !== 'EEXIST' || !lstatSync(name).isDirectory()) throw error;
    }
  }
  ensureDirectory(parent);
  const parentIdentity = lstatSync(parent);
  const directory = mkdtempSync(path.join(parent, prefix));
  const identity = lstatSync(directory);
  function assertOwned(name, expected) {
    const actual = lstatSync(name);
    if (!actual.isDirectory() || actual.dev !== expected.dev || actual.ino !== expected.ino || actual.birthtimeMs !== expected.birthtimeMs) {
      throw new Error('Workspace directory ownership changed before cleanup.');
    }
  }
  let cleaned = false;
  return { directory, cleanup() {
    if (cleaned) return;
    cleaned = true;
    for (const [name, expected] of parents) assertOwned(name, expected);
    assertOwned(parent, parentIdentity);
    assertOwned(directory, identity);
    rmSync(directory, { recursive: true });
    for (const [name, expected] of parents.reverse()) {
      assertOwned(name, expected);
      try { rmdirSync(name); }
      catch (error) { if (error.code !== 'ENOTEMPTY' && error.code !== 'EEXIST') throw error; }
    }
  } };
}

/** Restore only an empty directory that the provider removed during teardown.
 * @param {{ repoRoot: string, before: WorkspaceMetadata }} options
 */
export function restorePreexistingEmptyWranglerTemp({ repoRoot, before }) {
  const relative = '.wrangler/tmp';
  if (before[relative]?.type !== 'directory' || Object.keys(before).some(name => name.startsWith(`${relative}/`))) return false;
  const stat = name => {
    try { return lstatSync(name); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
  };
  const parent = path.join(repoRoot, '.wrangler');
  const parentState = stat(parent);
  if (parentState && !parentState.isDirectory()) return false;
  const directory = path.join(repoRoot, relative);
  if (stat(directory)) return false;
  if (!parentState) mkdirSync(parent);
  mkdirSync(directory);
  return true;
}

/**
 * @typedef {{ type: 'directory' } | { type: 'file' | 'symlink', size: number, mtimeMs: number }} WorkspaceEntry
 * @typedef {Record<string, WorkspaceEntry>} WorkspaceMetadata
 * @typedef {{ path: string, change: 'created' | 'deleted' | 'modified', metadata?: WorkspaceEntry }} WorkspaceChange
 */

function normalizeRelativePath(value) {
  return String(value).split(path.sep).join("/").replace(/^\.\//, "").replace(/\/$/, "");
}

function isAtOrBelow(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function isExcluded(candidate, excludedRoots) {
  return excludedRoots.some((root) => isAtOrBelow(candidate, root));
}

/** @param {{ repoRoot: string, excludedRoots?: string[] }} options
 * @returns {WorkspaceMetadata}
 */
export function captureWorkspaceMetadata({
  repoRoot,
  excludedRoots = DEFAULT_EXCLUDED_ROOTS,
}) {
  const normalizedExcludedRoots = excludedRoots.map(normalizeRelativePath);
  /** @type {WorkspaceMetadata} */
  const entries = {};

  function visit(relativeDirectory) {
    const absoluteDirectory = path.join(repoRoot, relativeDirectory);
    for (const entry of readdirSync(absoluteDirectory, { withFileTypes: true })) {
      const relativePath = normalizeRelativePath(path.join(relativeDirectory, entry.name));
      if (isExcluded(relativePath, normalizedExcludedRoots)) continue;
      const absolutePath = path.join(repoRoot, relativePath);
      const stat = lstatSync(absolutePath);
      const type = stat.isDirectory() ? "directory" : stat.isSymbolicLink() ? "symlink" : "file";
      entries[relativePath] = type === "directory"
        ? { type }
        : { type, size: stat.size, mtimeMs: stat.mtimeMs };
      if (type === "directory") visit(relativePath);
    }
  }

  visit("");
  return entries;
}

/** @param {{ before: WorkspaceMetadata, after: WorkspaceMetadata }} options
 * @returns {WorkspaceChange[]}
 */
export function compareWorkspaceMetadata({ before, after }) {
  const paths = [...new Set([...Object.keys(before), ...Object.keys(after)])].sort();
  return paths.flatMap((relativePath) => {
    if (before[relativePath] === undefined) {
      return [{ path: relativePath, change: "created", metadata: after[relativePath] }];
    }
    if (after[relativePath] === undefined) {
      return [{ path: relativePath, change: "deleted", metadata: before[relativePath] }];
    }
    return JSON.stringify(before[relativePath]) === JSON.stringify(after[relativePath])
      ? []
      : [{ path: relativePath, change: "modified", metadata: after[relativePath] }];
  });
}

/** @param {string} output
 * @returns {string[]}
 */
export function parsePorcelainStatus(output) {
  return String(output)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
}

/**
 * Metadata is optional for externally supplied changes; only a known directory
 * may receive the ancestor-of-an-allowed-output exemption.
 * @param {{ nonGating?: boolean, paths: string[], filesystemChanges?: WorkspaceChange[], allowedOutputRoots?: string[] }} options
 */
export function evaluateWorkspaceCleanliness({
  nonGating = false,
  paths,
  filesystemChanges = [],
  allowedOutputRoots = [],
}) {
  const dirtyPaths = [...paths];
  const normalizedAllowedRoots = allowedOutputRoots.map(normalizeRelativePath);
  const unexpectedFilesystemChanges = filesystemChanges.filter((entry) => {
    const candidate = normalizeRelativePath(entry.path);
    return !normalizedAllowedRoots.some((root) =>
      isAtOrBelow(candidate, root) ||
      (entry.metadata?.type === "directory" && isAtOrBelow(root, candidate)),
    );
  });
  const dirty = dirtyPaths.length > 0 || unexpectedFilesystemChanges.length > 0;
  return {
    dirty,
    paths: dirtyPaths,
    filesystemChanges,
    unexpectedFilesystemChanges,
    verdict: dirty ? (nonGating ? "warning" : "fail") : "pass",
  };
}

/** @param {{ startCommit: string | null, endCommit: string | null, startPaths: string[], endPaths: string[], nonGating?: boolean }} options */
export function evaluateImmutableRunContext({ startCommit, endCommit, startPaths, endPaths, nonGating = false }) {
  const failures = [];
  if (!/^[0-9a-f]{40}$/.test(startCommit ?? "") || endCommit !== startCommit) failures.push(`HEAD changed from ${startCommit ?? "unknown"} to ${endCommit ?? "unknown"}`);
  if (startPaths.length) failures.push(`run started with dirty paths: ${startPaths.join(", ")}`);
  if (endPaths.length) failures.push(`run ended with dirty paths: ${endPaths.join(", ")}`);
  return { startCommit, endCommit, startPaths, endPaths, failures, verdict: failures.length ? (nonGating ? "warning" : "fail") : "pass" };
}
