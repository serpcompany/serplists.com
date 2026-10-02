import { statSync } from "node:fs";
import path from "node:path";

const FOLDERS_SECRETLINT_SKIPS_BY_DEFAULT = new Set([".git", "node_modules"]);

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

export function selectScanTargets(paths: readonly string[], { cwd }: { cwd: string }): string[] {
  const targets: string[] = [];

  for (const requested of paths) {
    const absolutePath = path.resolve(cwd, requested);
    const segments = path.relative(cwd, absolutePath).split(/[\\/]/);

    if (segments.some((segment) => FOLDERS_SECRETLINT_SKIPS_BY_DEFAULT.has(segment))) continue;
    if (!isFile(absolutePath)) continue;

    targets.push(absolutePath);
  }

  return targets;
}
