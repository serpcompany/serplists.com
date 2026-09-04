import { lstatSync, readdirSync } from "node:fs";
import path from "node:path";

const DEFAULT_EXCLUDED_ROOTS = [".git", "node_modules"];

function normalizeRelativePath(value) {
  return String(value).split(path.sep).join("/").replace(/^\.\//, "").replace(/\/$/, "");
}

function isAtOrBelow(candidate, root) {
  return candidate === root || candidate.startsWith(`${root}/`);
}

function isExcluded(candidate, excludedRoots) {
  return excludedRoots.some((root) => isAtOrBelow(candidate, root));
}

export function captureWorkspaceMetadata({
  repoRoot,
  excludedRoots = DEFAULT_EXCLUDED_ROOTS,
}) {
  const normalizedExcludedRoots = excludedRoots.map(normalizeRelativePath);
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

export function parsePorcelainStatus(output) {
  return String(output)
    .split("\n")
    .filter(Boolean)
    .map((line) => line.slice(3));
}

export function evaluateWorkspaceCleanliness({
  ci,
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
    verdict: ci && dirty ? "fail" : ci ? "pass" : "not-enforced",
  };
}
