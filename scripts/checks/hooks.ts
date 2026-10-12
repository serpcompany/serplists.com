import path from "node:path";

import { alreadyTold, toldFile } from "../../tools/checks/route.mjs";
import { failureReport, perFileChecks, runChecks, selectRun } from "./checks";
import { asPrefix } from "./files";
import { stopRule } from "./rules";

export async function editHookReport(at: string, file: string): Promise<string> {
  const relative = asPrefix(file, at);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return "";
  const run = selectRun([relative], at);
  return run.files.length === 0 ? "" : failureReport(await runChecks(perFileChecks, run)).trim();
}

export async function stopHookReport(at: string, changed: readonly string[], session: string | undefined): Promise<string> {
  const touched = selectRun(changed, at);
  const outcomes = [
    ...(touched.files.length > 0 ? await runChecks(perFileChecks, touched) : []),
    ...(await runChecks(["docs"], selectRun([], at))),
  ];
  const report = failureReport(outcomes).trim();
  if (!report || alreadyTold(toldFile(at, session), report)) return "";
  return `${report}\n\n${stopRule}`;
}
