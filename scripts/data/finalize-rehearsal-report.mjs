#!/usr/bin/env node
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { writeDataCheckReports } from "./reporting.mjs";
import { validateRehearsalRecoveryEvidence } from "./rehearsal-recovery-lib.mjs";
import { loadSanitizerPolicy, validateSanitizedRehearsalArtifact } from "./sanitizer-lib.mjs";
function arg(name) { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; }
try {
  const source = JSON.parse(readFileSync(arg("--source"), "utf8"));
  const required = [arg("--comparison"), arg("--recovery"), arg("--teardown")];
  if (source.verdict !== "pass" || required.some((file) => !file || !existsSync(file))) throw new Error("Rehearsal evidence is incomplete or failed.");
  const output = arg("--output");
  const invariants = JSON.parse(readFileSync(arg("--comparison"), "utf8"));
  const recovery = validateRehearsalRecoveryEvidence({
    evidence: JSON.parse(readFileSync(arg("--recovery"), "utf8")),
    sourceDatabaseId: arg("--database-id"),
    recoveryDatabaseId: arg("--recovery-database-id"),
  });
  const recoveryPass = recovery.verdict === "pass";
  const sanitizedManifest = JSON.parse(readFileSync(arg("--sanitizer-manifest"), "utf8"));
  validateSanitizedRehearsalArtifact({
    sql: readFileSync(arg("--sanitized"), "utf8"),
    manifest: sanitizedManifest,
    policy: loadSanitizerPolicy({ repoRoot: path.resolve(new URL("../..", import.meta.url).pathname) }),
    now: new Date(),
  });
  const teardownPass = /PASS rehearsal .* is absent/.test(readFileSync(arg("--teardown"), "utf8"));
  if (invariants.verdict !== "pass" || !recoveryPass || !teardownPass) throw new Error("Remote rehearsal invariants, recovery, or confirmed teardown failed.");
  const report = {
    ...source,
    commit: arg("--commit"),
    target: { environment: "rehearsal", binding: "DB", databaseName: arg("--database-name"), databaseId: arg("--database-id") },
    migrationRange: arg("--migration-from") === "none"
      ? { from: null, to: null }
      : { from: arg("--migration-from"), to: arg("--migration-to") },
    remoteInvariants: invariants,
    recovery,
    sanitizedSource: {
      verdict: "pass",
      attestation: { verdict: "pass", verifier: "github-cli-before-import" },
      sanitizerVersion: sanitizedManifest.sanitizerVersion,
      artifactSha256: sanitizedManifest.artifact.sha256,
      manifestIntegritySha256: sanitizedManifest.manifestIntegritySha256,
    },
    teardown: { ...source.teardown, verdict: teardownPass ? "pass" : "fail", remoteEvidence: arg("--teardown") },
  };
  mkdirSync(path.dirname(output), { recursive: true });
  writeFileSync(output, JSON.stringify(report, null, 2) + "\n");
  writeFileSync(output.replace(/\.json$/, ".md"), `# Production-shaped rehearsal: PASS\n\nCommit: ${report.commit}\nDatabase: ${report.target.databaseName} (${report.target.databaseId})\nMigration: ${report.migrationRange.from} -> ${report.migrationRange.to}\nRecovery and teardown: PASS\n`);
  writeFileSync(output.replace(/\.json$/, ".junit.xml"), '<testsuite name="production-shaped-rehearsal" tests="1" failures="0"><testcase name="rehearsal"/></testsuite>\n');
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  const output = arg("--output") ?? "tmp/data-reports/rehearsal/data-regression-suite.json";
  writeDataCheckReports({ name: "data-regression-suite", report: { check: "production-shaped-rehearsal", verdict: "fail", commit: arg("--commit") ?? "unknown", error: message }, summary: `BLOCKED production-shaped rehearsal: ${message}`, reportDirectory: path.dirname(output) });
  console.error(message);
  process.exitCode = 1;
}
