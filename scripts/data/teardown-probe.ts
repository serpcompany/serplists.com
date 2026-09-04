import { readFileSync } from "node:fs";

import { replayMigrations } from "./schema-contract";

export function runFixtureTeardownProbe() {
  const database = replayMigrations();
  database.exec(readFileSync(new URL("./sql/deterministic-fixtures.sql", import.meta.url), "utf8"));
  database.exec(readFileSync(new URL("./sql/teardown-deterministic-fixtures.sql", import.meta.url), "utf8"));
  const counts = database.prepare(`
    SELECT
      (SELECT COUNT(*) FROM users WHERE id = 'data-safety-fixture-user-v1') AS leaked_users,
      (SELECT COUNT(*) FROM templates WHERE id = 'data-safety-fixture-template-v1') AS leaked_templates,
      (SELECT COUNT(*) FROM checklist_runs WHERE id = 'data-safety-fixture-run-v1') AS leaked_runs
  `).get() as {
    leaked_users: number;
    leaked_templates: number;
    leaked_runs: number;
  };
  database.close();
  const result = {
    leakedUsers: Number(counts.leaked_users),
    leakedTemplates: Number(counts.leaked_templates),
    leakedRuns: Number(counts.leaked_runs),
  };
  return {
    ...result,
    verdict: Object.values(result).every((value) => value === 0) ? "pass" : "fail",
  } as const;
}
