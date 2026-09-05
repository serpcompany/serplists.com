import { execFileSync, spawnSync } from "node:child_process";
import { createHash } from "node:crypto";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  lstatSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { createSanitizerCliFixture } from "./sanitizer-cli-fixture.mjs";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const workspaceRoot = path.resolve(scriptDir, "../..");
let fixture;
let repoRoot;
let script;
let allowedEvidenceRoot;
let allowedRawRoot;
let allowedReportRoot;
let evidenceRoot;
let rawRoot;
let sanitizerReportRoot;
const productionDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
let gitCommit;
const sourceDate = new Date().toISOString().slice(0, 10);
const retentionDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
const validRawExport = readFileSync(path.join(workspaceRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8");

// Observe operator-owned defaults without emitting their contents or following links.
function snapshotDefaultArtifacts() {
  function snapshot(target) {
    let stat;
    try {
      stat = lstatSync(target);
    } catch (error) {
      if (error.code === "ENOENT") return null;
      throw error;
    }
    return {
      mode: stat.mode, inode: stat.ino, size: stat.size,
      modified: stat.mtimeMs, changed: stat.ctimeMs,
      digest: stat.isFile() ? createHash("sha256").update(readFileSync(target)).digest("hex")
        : stat.isSymbolicLink() ? createHash("sha256").update(readlinkSync(target)).digest("hex") : null,
      children: stat.isDirectory() ? Object.fromEntries(readdirSync(target).sort().map((name) => [name, snapshot(path.join(target, name))])) : null,
    };
  }
  return [
    snapshot(path.join(workspaceRoot, "tmp/data-evidence/production-source.identity.json")),
    snapshot(path.join(workspaceRoot, "tmp/data-reports/sanitizer")),
  ];
}

function allocateOwnedDirectory(parent) {
  mkdirSync(parent, { recursive: true });
  return mkdtempSync(path.join(parent, "sanitizer-cli-test-"));
}

function commandArgs(inputPath, outputPath, manifestPath) {
  mkdirSync(evidenceRoot, { recursive: true });
  const sourceIdentityPath = path.join(evidenceRoot, "production-source.identity.json");
  writeFileSync(sourceIdentityPath, JSON.stringify({ verdict: "pass", commit: gitCommit, environment: "production", binding: "DB", databaseName: "serp-checklists-db", databaseId: productionDatabaseId, before: { databaseName: "serp-checklists-db", databaseId: productionDatabaseId }, after: { databaseName: "serp-checklists-db", databaseId: productionDatabaseId } }));
  return [
    script,
    "--input", inputPath,
    "--output", path.relative(repoRoot, outputPath),
    "--manifest", path.relative(repoRoot, manifestPath),
    "--report-dir", path.relative(repoRoot, sanitizerReportRoot),
    "--source-identity-evidence", sourceIdentityPath,
    "--source-date", sourceDate,
    "--source-schema", "0023_add_sitemap_revision_state.sql",
    "--issue", "95",
    "--approver-identity", "@devinschumacher",
    "--retention-deadline", retentionDeadline,
    "--migration-from", "0024_safe_template_evolution.sql",
    "--migration-to", "0024_safe_template_evolution.sql",
  ];
}

function workflowRequestEnvironment() {
  return {
    ...fixture.env,
    GITHUB_ACTIONS: "true",
    GITHUB_REPOSITORY: "serpcompany/serplists.com",
    GITHUB_REF_PROTECTED: "true",
    GITHUB_EVENT_NAME: "workflow_dispatch",
    GITHUB_RUN_ID: "123456789",
    GITHUB_SHA: gitCommit,
    GITHUB_REF: "refs/heads/main",
    DATA_PROMOTION_WORKFLOW: "data-promotion",
    DATA_PROTECTED_ENVIRONMENT: "production",
    DATA_APPROVER_IDENTITY: "@devinschumacher",
    CLOUDFLARE_API_TOKEN: "protected-production-token",
  };
}

describe("sanitizer command", () => {
  it.each(["table", "filename", "identity", "identity-json", "owner", "range", "source-schema", "source-date", "manifest-path"])("keeps every CLI format content-free on %s rejection", scenario => {
    const sentinel = "private.customer@example.test";
    const inputPath = path.join(rawRoot, scenario === "filename" ? sentinel : "source.sql");
    const outputPath = path.join(evidenceRoot, "out.sql");
    const manifestPath = path.join(evidenceRoot, "manifest.json");
    writeFileSync(inputPath, scenario === "table" ? `INSERT INTO "${sentinel}" VALUES ('x');` : validRawExport);
    const args = commandArgs(inputPath, outputPath, manifestPath);
    const set = (flag, value) => { args[args.indexOf(flag) + 1] = value; };
    if (scenario === "filename") rmSync(inputPath);
    if (scenario === "identity" || scenario === "identity-json") {
      const identityPath = args[args.indexOf("--source-identity-evidence") + 1];
      const evidence = JSON.parse(readFileSync(identityPath, "utf8"));
      evidence.databaseId = sentinel;
      writeFileSync(identityPath, scenario === "identity-json" ? `{"${sentinel}":` : JSON.stringify(evidence));
    }
    if (scenario === "owner") set("--approver-identity", sentinel);
    if (scenario === "range") set("--migration-from", "0024_private_customer_identifier.sql");
    if (scenario === "source-schema") set("--source-schema", sentinel);
    if (scenario === "source-date") set("--source-date", sentinel);
    if (scenario === "manifest-path") set("--manifest", path.join(evidenceRoot, sentinel, "manifest.json"));
    const result = spawnSync(process.execPath, [...args, "--execute"], { cwd: repoRoot, env: workflowRequestEnvironment(), encoding: "utf8" });
    expect(result.status).toBe(1);
    const outputs = [result.stdout, result.stderr, ...["json", "junit.xml", "md", "txt"].map(ext => readFileSync(path.join(sanitizerReportRoot, `sanitize-production-export.${ext}`), "utf8"))];
    for (const output of outputs) {
      expect(output.includes(sentinel)).toBe(false);
      expect(output.includes("0024_private_customer_identifier.sql")).toBe(false);
    }
    const report = JSON.parse(outputs[2]);
    expect(report).toMatchObject({ verdict: "fail", commit: gitCommit, target: { environment: "production", binding: "DB", databaseName: "serp-checklists-db", databaseId: productionDatabaseId }, stage: expect.any(String), code: expect.any(String) });
    if (scenario !== "range") expect(report.migrationRange).toEqual({ from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" });
    for (const output of outputs.slice(2)) for (const safe of [gitCommit, productionDatabaseId, "serp-checklists-db", "production", "DB"]) expect(output).toContain(safe);
    expect(existsSync(inputPath)).toBe(false);
  });
  let defaultArtifactsBefore;
  beforeAll(() => {
    defaultArtifactsBefore = snapshotDefaultArtifacts();
    fixture = createSanitizerCliFixture(workspaceRoot);
    repoRoot = fixture.repoRoot;
    gitCommit = fixture.commit;
    script = path.join(repoRoot, "scripts/data/sanitize-rehearsal-export.mjs");
    allowedEvidenceRoot = path.join(repoRoot, "tmp/data-evidence");
    allowedRawRoot = path.join(repoRoot, "tmp/production-sensitive");
    allowedReportRoot = path.join(repoRoot, "tmp/data-reports");
  });
  beforeEach(() => {
    evidenceRoot = allocateOwnedDirectory(allowedEvidenceRoot);
    rawRoot = allocateOwnedDirectory(allowedRawRoot);
    sanitizerReportRoot = allocateOwnedDirectory(allowedReportRoot);
  });
  afterEach(() => {
    expect(snapshotDefaultArtifacts()).toEqual(defaultArtifactsBefore);
  });
  afterAll(() => {
    try { fixture?.cleanup(); }
    finally { expect(snapshotDefaultArtifacts()).toEqual(defaultArtifactsBefore); }
  });

  it("contains default-report fallback from malformed arguments inside the owned checkout", () => {
    expect(lstatSync(script).isSymbolicLink()).toBe(false);
    for (const name of ["sanitize-rehearsal-export.mjs", "sanitizer-lib.mjs"]) {
      expect(readFileSync(path.join(repoRoot, "scripts/data", name))).toEqual(readFileSync(path.join(workspaceRoot, "scripts/data", name)));
    }
    const result = spawnSync(process.execPath, [script, "invalid-positional-argument"], { cwd: repoRoot, env: fixture.env, encoding: "utf8" });
    expect(result.status).toBe(1);
    for (const ext of ["json", "junit.xml", "md", "txt"]) {
      expect(readFileSync(path.join(allowedReportRoot, "sanitizer", `sanitize-production-export.${ext}`), "utf8")).toContain(gitCommit);
    }
    expect(snapshotDefaultArtifacts()).toEqual(defaultArtifactsBefore);
  });

  it("is dry-run by default and constrains raw input to non-artifact sensitive storage", () => {
    mkdirSync(evidenceRoot, { recursive: true });
    mkdirSync(rawRoot, { recursive: true });
    const output = execFileSync(process.execPath, commandArgs(
      path.join(rawRoot, "not-read-in-dry-run.sql"),
      path.join(evidenceRoot, "synthetic.sql"),
      path.join(evidenceRoot, "synthetic.manifest.json"),
    ), { cwd: repoRoot, env: fixture.env, encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({
      sanitizer: "source-derived-shape-v5",
      issueNumber: 95,
      requestedApproverIdentity: "@devinschumacher",
    });

    const outside = spawnSync(process.execPath, commandArgs(
      path.join(fixture.allocation, "private-source.sql"),
      path.join(evidenceRoot, "synthetic.sql"),
      path.join(evidenceRoot, "synthetic.manifest.json"),
    ), { cwd: repoRoot, env: fixture.env, encoding: "utf8" });
    expect(outside.status).toBe(1);
    expect(outside.stderr).toMatch(/raw input.*tmp\/production-sensitive/i);
  });

  it("deletes the constrained raw input when workflow request metadata is absent", () => {
    const tempDir = mkdtempSync(path.join(evidenceRoot, "sanitize-context-failure-"));
    const rawDir = mkdtempSync(path.join(rawRoot, "sanitize-context-failure-"));
    const inputPath = path.join(rawDir, "private-source.sql");
    writeFileSync(inputPath, "INSERT INTO users VALUES ('private');\n");
    {
      const result = spawnSync(process.execPath, [
        ...commandArgs(inputPath, path.join(tempDir, "out.sql"), path.join(tempDir, "manifest.json")),
        "--execute",
      ], { cwd: repoRoot, env: fixture.env, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/workflow.*context/i);
      expect(existsSync(inputPath)).toBe(false);
      const report = JSON.parse(readFileSync(path.join(sanitizerReportRoot, "sanitize-production-export.json"), "utf8"));
      expect(report).toMatchObject({ verdict: "fail", commit: gitCommit, target: { environment: "production", binding: "DB", databaseId: productionDatabaseId }, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" }, sanitizerVersion: "source-derived-shape-v5" });
      for (const name of ["sanitize-production-export.md", "sanitize-production-export.junit.xml"]) expect(readFileSync(path.join(sanitizerReportRoot, name), "utf8")).toContain(gitCommit);
    }
  });

  it("rejects sanitizer execution when identity-bound export evidence changes UUID", () => {
    const tempDir = mkdtempSync(path.join(evidenceRoot, "sanitize-identity-mismatch-"));
    const rawDir = mkdtempSync(path.join(rawRoot, "sanitize-identity-mismatch-"));
    const inputPath = path.join(rawDir, "private-source.sql");
    const outputPath = path.join(tempDir, "out.sql");
    const manifestPath = path.join(tempDir, "manifest.json");
    writeFileSync(inputPath, validRawExport);
    {
      const args = commandArgs(inputPath, outputPath, manifestPath);
      const evidencePath = args[args.indexOf("--source-identity-evidence") + 1];
      const evidence = JSON.parse(readFileSync(evidencePath, "utf8"));
      evidence.after.databaseId = "22222222-2222-4222-8222-222222222222";
      writeFileSync(evidencePath, JSON.stringify(evidence));
      const result = spawnSync(process.execPath, [...args, "--execute"], { cwd: repoRoot, env: workflowRequestEnvironment(), encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/identity-bound production export evidence/i);
      expect(existsSync(inputPath)).toBe(false);
      expect(existsSync(manifestPath)).toBe(false);
    }
  });

  it("refuses an evidence-directory symlink that escapes to a raw file outside it", () => {
    const evidenceDir = mkdtempSync(path.join(evidenceRoot, "sanitize-symlink-"));
    const rawDir = mkdtempSync(path.join(rawRoot, "sanitize-symlink-"));
    const outsideDir = mkdtempSync(path.join(fixture.allocation, "sanitize-outside-"));
    const outsidePath = path.join(outsideDir, "private.sql");
    const linkPath = path.join(rawDir, "private.sql");
    writeFileSync(outsidePath, "INSERT INTO users VALUES ('private');");
    symlinkSync(outsidePath, linkPath);
    {
      const result = spawnSync(process.execPath, commandArgs(
        linkPath,
        path.join(evidenceDir, "out.sql"),
        path.join(evidenceDir, "manifest.json"),
      ), { cwd: repoRoot, env: fixture.env, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/raw input.*tmp\/production-sensitive/i);
      expect(existsSync(outsidePath)).toBe(true);
    }
  });

  it("deletes raw input on sanitizer failure and on success", () => {
    for (const [name, rawExport, expectedStatus] of [
      ["failure", "CREATE TABLE private_data (value TEXT);", 1],
      ["incomplete", "INSERT INTO users (id,email) VALUES ('owner','sanitized-owner');", 1],
      ["success", validRawExport, 0],
    ]) {
      const tempDir = mkdtempSync(path.join(evidenceRoot, `sanitize-${name}-`));
      const rawDir = mkdtempSync(path.join(rawRoot, `sanitize-${name}-`));
      const inputPath = path.join(rawDir, "private-source.sql");
      const outputPath = path.join(tempDir, "out.sql");
      const manifestPath = path.join(tempDir, "manifest.json");
      writeFileSync(inputPath, rawExport);
      {
        const result = spawnSync(process.execPath, [
          ...commandArgs(inputPath, outputPath, manifestPath),
          "--execute",
        ], { cwd: repoRoot, env: workflowRequestEnvironment(), encoding: "utf8" });
        expect(result.status, result.stderr).toBe(expectedStatus);
        expect(existsSync(inputPath)).toBe(false);
        if (expectedStatus === 0) {
          expect(readFileSync(outputPath, "utf8")).toMatch(/source-derived, content-free/i);
          expect(JSON.parse(readFileSync(manifestPath, "utf8"))).toHaveProperty(
            "manifestIntegritySha256",
          );
        } else {
          const report = JSON.parse(readFileSync(path.join(sanitizerReportRoot, "sanitize-production-export.json"), "utf8"));
          expect(report).toMatchObject({ verdict: "fail", commit: gitCommit, migrationRange: { from: "0024_safe_template_evolution.sql", to: "0024_safe_template_evolution.sql" } });
          expect(readFileSync(path.join(sanitizerReportRoot, "sanitize-production-export.junit.xml"), "utf8")).toContain(gitCommit);
        }
      }
    }
  });
});
