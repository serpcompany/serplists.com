import { spawnSync } from "node:child_process";
import { constants, getPriority, setPriority } from "node:os";

const words = process.argv.slice(2);
if (words.length === 0) {
  console.error("Usage: node --import tsx scripts/run-at-low-priority.ts <command> [arguments]");
  process.exit(2);
}

if (getPriority() < constants.priority.PRIORITY_BELOW_NORMAL) setPriority(constants.priority.PRIORITY_BELOW_NORMAL);
const result = spawnSync(words.join(" "), { shell: true, stdio: "inherit" });
process.exitCode = result.status ?? 1;
