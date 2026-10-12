import { closeSync, openSync, readSync, statSync } from "node:fs";
import path from "node:path";

const FOLDERS_SECRETLINT_SKIPS_BY_DEFAULT = new Set([".git", "node_modules"]);
const BYTES_READ_TO_TELL_TEXT = 8000;

function isFile(filePath: string): boolean {
  try {
    return statSync(filePath).isFile();
  } catch {
    return false;
  }
}

function isText(filePath: string): boolean {
  const sample = Buffer.alloc(BYTES_READ_TO_TELL_TEXT);
  const file = openSync(filePath, "r");
  try {
    return !sample.subarray(0, readSync(file, sample, 0, BYTES_READ_TO_TELL_TEXT, 0)).includes(0);
  } finally {
    closeSync(file);
  }
}

export function selectScanTargets(paths: readonly string[], { cwd }: { cwd: string }): string[] {
  const targets: string[] = [];

  for (const requested of paths) {
    const absolutePath = path.resolve(cwd, requested);
    const segments = path.relative(cwd, absolutePath).split(/[\\/]/);

    if (segments.some((segment) => FOLDERS_SECRETLINT_SKIPS_BY_DEFAULT.has(segment))) continue;
    if (!isFile(absolutePath) || !isText(absolutePath)) continue;

    targets.push(absolutePath);
  }

  return targets;
}
