import { createEngine } from "@secretlint/node";

import { selectScanTargets } from "../secret-scan-lib";
import { root, toPosix, withoutRoot } from "./files";

const namesAFile = (line: string) => !/^\s/.test(line) && !line.startsWith("✖");

export async function findSecrets(at: string, files: readonly string[]): Promise<string[]> {
  const targets = selectScanTargets(files, { cwd: at });
  if (targets.length === 0) return [];
  const engine = await createEngine({ cwd: root, formatter: "stylish", color: false, maskSecrets: true });
  const { ok, output } = await engine.executeOnFiles({ filePathList: targets });
  if (ok) return [];
  return output
    .split(/\r?\n/)
    .map((line) => withoutRoot(line, at).trimEnd())
    .filter(Boolean)
    .map((line) => (namesAFile(line) ? toPosix(line) : line));
}
