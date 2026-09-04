export function parsePendingMigrationNames(output) {
  const normalized = String(output).replace(/\u001b\[[0-9;]*m/g, "");
  if (/truncated output/i.test(normalized)) {
    throw new Error("Truncated Wrangler migration output is not trustworthy.");
  }
  const cleanLines = normalized.split(/\r?\n/).filter((line) => /^(?:✅|✔)?\s*no migrations to apply!\s*$/i.test(line.trim()));
  if (cleanLines.length === 1 && !/Migrations to be applied:/i.test(normalized) && !/\b\d{4}_[a-z0-9_]+\.sql\b/.test(normalized)) {
    return [];
  }
  if (!/Migrations to be applied:/i.test(normalized)) {
    throw new Error("Unrecognized Wrangler migration-list output; refusing to infer a clean ledger.");
  }
  const pendingSection = normalized.slice(normalized.search(/Migrations to be applied:/i));
  if (!/┌[^\n]*┐/.test(pendingSection) || !/└[^\n]*┘/.test(pendingSection)) {
    throw new Error("Malformed Wrangler pending-migration table.");
  }
  const rows = [...pendingSection.matchAll(/^│\s*(\d{4}_[a-z0-9_]+\.sql)\s*│\s*$/gm)].map((match) => match[1]);
  if (!rows.length) throw new Error("Malformed Wrangler pending-migration table: no migration rows.");
  return [...new Set(rows)].sort();
}

export function buildPendingMigrationReport({
  commit,
  database,
  databaseId,
  environment,
  migrationFiles,
  mode,
  pendingMigrations,
}) {
  return {
    check: "pending-migrations",
    commit,
    target: { environment, database, databaseId, mode },
    migrationRange: migrationFiles.length
      ? { from: migrationFiles[0], to: migrationFiles.at(-1) }
      : { from: null, to: null },
    pendingMigrations,
    verdict: pendingMigrations.length ? "fail" : "pass",
  };
}

export function renderPendingMigrationSummary(report) {
  const identity = `${report.target.environment}:${report.target.database} (${report.target.databaseId ?? "unresolved-id"})`;
  if (report.verdict === "pass") {
    return `PASS ${identity}: no pending migrations; checked ${report.migrationRange.from ?? "none"} → ${report.migrationRange.to ?? "none"} at ${report.commit}.`;
  }

  const count = report.pendingMigrations.length;
  return [
    `BLOCKED ${identity}: ${count} pending migration${count === 1 ? "" : "s"}.`,
    ...report.pendingMigrations.map((name) => `- ${name}`),
    `Commit: ${report.commit}; checked range: ${report.migrationRange.from} → ${report.migrationRange.to}.`,
    "Apply the reviewed migration before deploying compatible application code.",
  ].join("\n");
}
