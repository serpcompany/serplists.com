import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { findPreviewD1BindingProblem } from "./check-preview-d1-binding-lib.mjs";
import { readD1Databases } from "./d1-baseline-migrations-lib.mjs";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const problem = findPreviewD1BindingProblem(readD1Databases(readFileSync(path.join(repoRoot, "wrangler.toml"), "utf8")));

if (problem) {
  console.error(problem);
  process.exit(1);
}

console.log("Preview D1 binding points at a separate database.");
