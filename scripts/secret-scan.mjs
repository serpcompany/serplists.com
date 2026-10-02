import { spawnSync } from "node:child_process";
import { createEngine } from "@secretlint/node";

import { selectScanTargets } from "./secret-scan-lib.mjs";

function listTrackedFiles() {
  const result = spawnSync("git", ["ls-files", "-z"], { encoding: "utf8" });

  if (result.error) {
    console.error(result.error.message);
    process.exit(2);
  }

  if (result.status !== 0) {
    process.stderr.write(result.stderr ?? "");
    process.exit(result.status ?? 2);
  }

  return result.stdout.split("\0").filter(Boolean);
}

const cwd = process.cwd();
const requested = process.argv.length > 2 ? process.argv.slice(2) : listTrackedFiles();
const targets = selectScanTargets(requested, { cwd });

if (targets.length === 0) {
  process.exit(0);
}

try {
  const engine = await createEngine({
    cwd,
    formatter: "stylish",
    color: Boolean(process.stdout.isTTY),
    maskSecrets: true,
  });
  const { ok, output } = await engine.executeOnFiles({ filePathList: targets });

  if (output) {
    process.stdout.write(output.endsWith("\n") ? output : `${output}\n`);
  }

  if (!ok) {
    process.exit(1);
  }

  console.log(`secret-scan: no secrets found in ${targets.length} file(s).`);
} catch (error) {
  console.error(`secret-scan: ${error instanceof Error ? error.message : String(error)}`);
  process.exit(2);
}
