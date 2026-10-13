import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { filesGitTracksOrWouldTrack, GENERATED_FILES } from "../check-no-comments-lib";

export const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");

const SCRIPT_FILE = /\.(?:[cm]?[jt]s|[jt]sx)$/;

export const isScriptFile = (file: string) => SCRIPT_FILE.test(file) && !GENERATED_FILES.includes(file);

export const toPosix = (file: string) => file.replaceAll("\\", "/");

export interface Run {
  root: string;
  all: readonly string[];
  files: readonly string[];
  prefixes: readonly string[];
}

export function repositoryFiles(at: string = root): string[] {
  const listed = new Set(filesGitTracksOrWouldTrack(at));
  return [...listed].filter((file) => existsSync(path.join(at, file))).sort();
}

export function asPrefix(requested: string, at: string = root): string {
  const relative = path.isAbsolute(requested) ? path.relative(at, requested) : requested;
  return toPosix(relative).replace(/^\.\//, "").replace(/\/+$/, "");
}

export const covers = (prefixes: readonly string[], file: string) =>
  prefixes.length === 0 || prefixes.some((prefix) => file === prefix || file.startsWith(`${prefix}/`));

export function withoutRoot(text: string, at: string): string {
  return [`${at}${path.sep}`, `${toPosix(at)}/`].reduce((kept, prefix) => kept.replaceAll(prefix, ""), text);
}
