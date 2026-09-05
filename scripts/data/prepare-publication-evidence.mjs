#!/usr/bin/env node
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

// This artifact is data only. The privileged publisher independently binds and
// allowlists every field; arbitrary report text and failure messages are omitted.
let range;
try { range = JSON.parse(readFileSync("tmp/data-reports/staging/staging-reviewed-range.json", "utf8")).migrationRange; } catch { /* Early failures may have no range. */ }
const env = process.env;
const report = {
  schemaVersion: 1,
  commit: env.GITHUB_SHA,
  runId: Number(env.GITHUB_RUN_ID), attempt: Number(env.GITHUB_RUN_ATTEMPT),
  environment: env.PUBLICATION_ENVIRONMENT,
  databaseId: env.PUBLICATION_DATABASE_ID,
  migrationRange: { from: env.PUBLICATION_MIGRATION_FROM || env.MIGRATION_FROM || range?.from || null, to: env.PUBLICATION_MIGRATION_TO || env.MIGRATION_TO || range?.to || null },
};
mkdirSync("tmp/publication-evidence", { recursive: true });
writeFileSync("tmp/publication-evidence/publication.json", `${JSON.stringify(report)}\n`);
