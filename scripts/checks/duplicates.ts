import { existsSync, mkdtempSync, readFileSync, rmSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import path from "node:path";
import { z } from "zod";

import { root, toPosix } from "./files";
import { binOfPackageHolding, runNode } from "./tools";

const require = createRequire(import.meta.url);

export const duplicateFolders = ["src", "functions", "scripts", "db", "tests", "tools", ".claude/skills", ".github/actions"];

const location = z.object({ name: z.string().transform(toPosix), start: z.number(), end: z.number() });
const jscpdReport = z.object({
  duplicates: z.array(z.object({ lines: z.number(), firstFile: location, secondFile: location })),
});

type Location = z.infer<typeof location>;

export interface Duplicate {
  first: Location;
  second: Location;
  lines: number;
}

export function findDuplicates(at: string, paths: readonly string[]): Duplicate[] {
  if (paths.length === 0) return [];
  const output = mkdtempSync(path.join(tmpdir(), "serplists-duplicates-"));
  try {
    const settings = ["--config", path.join(root, ".jscpd.json"), "--reporters", "json", "--output", output, "--silent"];
    const ran = runNode(binOfPackageHolding(require.resolve("jscpd"), "jscpd"), [...settings, ...paths], { cwd: at });
    const written = path.join(output, "jscpd-report.json");
    if (!existsSync(written)) throw new Error(`jscpd wrote no report (exit ${ran.status}): ${ran.output}`);
    return jscpdReport
      .parse(JSON.parse(readFileSync(written, "utf8")))
      .duplicates.map(({ firstFile, secondFile, lines }) => ({ first: firstFile, second: secondFile, lines }))
      .sort((left, right) => left.first.name.localeCompare(right.first.name) || left.first.start - right.first.start);
  } finally {
    rmSync(output, { recursive: true, force: true });
  }
}

export const describeDuplicate = ({ first, second, lines }: Duplicate) =>
  `${first.name}:${first.start}-${first.end}  repeats ${second.name}:${second.start}-${second.end} (${lines} lines)`;
