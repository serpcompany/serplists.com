import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";

if (!existsSync(".git") || process.env.CI === "true" || process.env.CI === "1") {
  process.exit(0);
}

const result = spawnSync("lefthook", ["install"], {
  shell: process.platform === "win32",
  stdio: "inherit",
});

if (result.error) {
  console.error(result.error.message);
  process.exit(1);
}

process.exit(result.status ?? 1);
