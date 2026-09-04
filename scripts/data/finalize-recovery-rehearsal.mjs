#!/usr/bin/env node
import { existsSync, readFileSync, writeFileSync } from "node:fs";

function arg(name) { const index = process.argv.indexOf(name); return index < 0 ? null : process.argv[index + 1]; }

try {
  const comparison = JSON.parse(readFileSync(arg("--comparison"), "utf8"));
  const teardown = readFileSync(arg("--teardown"), "utf8");
  const sourceDatabaseName = arg("--source-database-name");
  const recoveryDatabaseName = arg("--recovery-database-name");
  const rawPath = arg("--raw");
  const manifest = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  const absencePass = [sourceDatabaseName, recoveryDatabaseName].every((name) =>
    teardown.includes(`PASS rehearsal ${name} is absent.`),
  );
  if (comparison.verdict !== "pass" || !absencePass || existsSync(rawPath)) {
    throw new Error("Recovery restore, invariant comparison, absence, or plaintext cleanup was not proven.");
  }
  const evidence = {
    verdict: "pass",
    commit: arg("--commit"),
    environment: arg("--environment"),
    sourceDatabase: { name: sourceDatabaseName, id: arg("--source-database-id") },
    recoveryDatabase: { name: recoveryDatabaseName, id: arg("--recovery-database-id") },
    migration: { from: arg("--migration-from"), to: arg("--migration-to") },
    sanitizer: { version: manifest.sanitizerVersion, artifactSha256: manifest.artifact.sha256 },
    import: { verdict: "pass", target: recoveryDatabaseName },
    invariants: { verdict: "pass", comparison: arg("--comparison") },
    absence: { verdict: "pass", evidence: arg("--teardown") },
    rawPlaintextRetained: false,
  };
  writeFileSync(arg("--output"), `${JSON.stringify(evidence, null, 2)}\n`, { mode: 0o600 });
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
