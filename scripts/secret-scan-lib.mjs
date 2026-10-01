import { statSync } from "node:fs";
import path from "node:path";

const FOLDERS_SECRETLINT_SKIPS_BY_DEFAULT = new Set([".git", "node_modules"]);

function isFile(filePath) {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function selectScanTargets(paths, { cwd }) {
  const targets = [];

  for (const requested of paths) {
    const absolutePath = path.resolve(cwd, requested);
    const segments = path.relative(cwd, absolutePath).split(/[\\/]/);

    if (segments.some((segment) => FOLDERS_SECRETLINT_SKIPS_BY_DEFAULT.has(segment))) continue;
    if (!isFile(absolutePath)) continue;

    targets.push(absolutePath);
  }

  return targets;
}
