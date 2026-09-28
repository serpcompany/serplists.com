import { statSync } from "node:fs";
import path from "node:path";

// The folders secretlint's CLI skips by default.
const IGNORED_SEGMENTS = new Set([".git", "node_modules"]);

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

/**
 * Resolves requested paths to the absolute files to scan.
 *
 * Paths are kept literal. The secretlint CLI treats any argument that looks
 * like a glob as a glob, so a Pages Functions route such as
 * `functions/api/[[route]].ts` matched nothing and was never scanned.
 * Missing paths (deleted files) and directories are dropped, as are files
 * under .git or node_modules.
 */
export function selectScanTargets(paths, { cwd }) {
  const targets = [];

  for (const requested of paths) {
    const absolutePath = path.resolve(cwd, requested);
    const segments = path.relative(cwd, absolutePath).split(/[\\/]/);

    if (segments.some((segment) => IGNORED_SEGMENTS.has(segment))) continue;
    if (!isFile(absolutePath)) continue;

    targets.push(absolutePath);
  }

  return targets;
}
