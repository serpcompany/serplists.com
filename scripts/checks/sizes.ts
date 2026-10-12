import { existsSync, readFileSync } from "node:fs";
import path from "node:path";

import { covers, isScriptFile, type Run } from "./files";
import type { Problem } from "./problems";

export const lineLimit = 500;

export interface SizeException {
  lines: number;
  reason: string;
}

export const knownLargeFiles: Readonly<Record<string, SizeException>> = {};

export const lineCount = (text: string) => text.split("\n").length - (text.endsWith("\n") ? 1 : 0);

function sizeProblem(lines: number, exception: SizeException | undefined): string | undefined {
  if (exception === undefined) return lines > lineLimit ? `has ${lines} lines, over the limit of ${lineLimit}` : undefined;
  if (!exception.reason.trim()) return "is excepted from the limit without a reason: give it one, or split the file";
  if (lines > exception.lines) return `grew to ${lines} lines, over its recorded ${exception.lines}: split it instead`;
  if (lines <= lineLimit) return `is down to ${lines} lines: remove it from knownLargeFiles`;
  if (lines < exception.lines) return `is down to ${lines} lines: lower its entry in knownLargeFiles to ${lines}`;
  return undefined;
}

export function checkSizes({ root, files, prefixes }: Omit<Run, "all">, known = knownLargeFiles): Problem[] {
  const problems: Problem[] = [];
  for (const file of files.filter(isScriptFile)) {
    const problem = sizeProblem(lineCount(readFileSync(path.join(root, file), "utf8")), known[file]);
    if (problem) problems.push({ path: file, problem });
  }
  for (const file of Object.keys(known)) {
    if (covers(prefixes, file) && !existsSync(path.join(root, file))) {
      problems.push({ path: file, problem: "no longer exists: remove it from knownLargeFiles" });
    }
  }
  return problems;
}
