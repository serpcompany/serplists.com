import { spawnSync } from "node:child_process";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizedGitEnvironment } from "./git-subprocess-env.mjs";
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const result = spawnSync(process.platform === "win32" ? "pnpm.cmd" : "pnpm", ["exec", "wrangler", "d1", "info", process.env.DATABASE_NAME, "--json"], { cwd: repoRoot, encoding: "utf8", env: sanitizedGitEnvironment() });
const output = `${result.stdout ?? ""}\n${result.stderr ?? ""}`;
if (result.status === 0 || !/(not found|could not find|does not exist|code.*7404)/i.test(output)) {
  console.error("Rehearsal absence could not be proven.");
  process.exit(1);
}
console.log(`PASS rehearsal ${process.env.DATABASE_NAME} is absent.`);
