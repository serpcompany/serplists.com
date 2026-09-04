#!/usr/bin/env node
import { appendFileSync, readFileSync } from "node:fs";
function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }
try {
  const evidence = JSON.parse(readFileSync(arg("--evidence"), "utf8"));
  const variable = arg("--variable");
  if (!/^(?:DATABASE_ID|RECOVERY_DATABASE_ID)$/.test(variable ?? "") || evidence?.verdict !== "pass" || evidence.commit !== process.env.GITHUB_SHA || evidence.runId !== process.env.GITHUB_RUN_ID || evidence.target?.environment !== "rehearsal" || !/^[0-9a-f-]{36}$/i.test(evidence.target?.databaseId ?? "") || !process.env.GITHUB_ENV) throw new Error("Creation evidence cannot be exported into this workflow run.");
  appendFileSync(process.env.GITHUB_ENV, `${variable}=${evidence.target.databaseId}\n`);
} catch (error) { console.error(error instanceof Error ? error.message : String(error)); process.exit(1); }
