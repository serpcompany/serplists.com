import { spawnSync } from "node:child_process";
import { availableParallelism, constants, getPriority, setPriority } from "node:os";

import { cpuCapCommand } from "./lib/cpu-cap";

const words = process.argv.slice(2);
if (words.length === 0) {
  console.error("Usage: node --import tsx scripts/run-at-low-priority.ts <command> [arguments]");
  process.exit(2);
}

if (getPriority() < constants.priority.PRIORITY_BELOW_NORMAL) setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
const cap = cpuCapCommand(process.platform, process.pid, availableParallelism());
if (cap) spawnSync(cap.command, cap.args, { stdio: "ignore" });
const result = spawnSync(words.join(" "), { shell: true, stdio: "inherit" });
process.exitCode = result.status ?? 1;
