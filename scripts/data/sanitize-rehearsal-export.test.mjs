import { execFileSync, spawnSync } from "node:child_process";
import {
  existsSync,
  mkdirSync,
  mkdtempSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

const scriptDir = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(scriptDir, "../..");
const script = path.join(repoRoot, "scripts/data/sanitize-rehearsal-export.mjs");
const evidenceRoot = path.join(repoRoot, "tmp/data-evidence");
const rawRoot = path.join(repoRoot, "tmp/production-sensitive");
const productionDatabaseId = "b62ccc0a-9c69-4828-9e9b-3bac6ba0e4f1";
const gitCommit = execFileSync("git", ["rev-parse", "HEAD"], { cwd: repoRoot, encoding: "utf8" }).trim();
const sourceDate = new Date().toISOString().slice(0, 10);
const retentionDeadline = new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString();
const validRawExport = readFileSync(path.join(repoRoot, "scripts/data/fixtures/production-export-edge-cases.sql"), "utf8");

function commandArgs(inputPath, outputPath, manifestPath) {
  return [
    script,
    "--input", inputPath,
    "--output", path.relative(repoRoot, outputPath),
    "--manifest", path.relative(repoRoot, manifestPath),
    "--source-database-id", productionDatabaseId,
    "--source-date", sourceDate,
    "--issue", "95",
    "--approver-identity", "@devinschumacher",
    "--retention-deadline", retentionDeadline,
  ];
}

function workflowRequestEnvironment() {
  return {
    ...process.env,
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
  it("is dry-run by default and constrains raw input to non-artifact sensitive storage", () => {
    mkdirSync(evidenceRoot, { recursive: true });
    mkdirSync(rawRoot, { recursive: true });
    const output = execFileSync(process.execPath, commandArgs(
      path.join(rawRoot, "not-read-in-dry-run.sql"),
      path.join(evidenceRoot, "synthetic.sql"),
      path.join(evidenceRoot, "synthetic.manifest.json"),
    ), { cwd: repoRoot, env: process.env, encoding: "utf8" });
    expect(JSON.parse(output)).toMatchObject({
      sanitizer: "source-derived-shape-v2",
      issueNumber: 95,
      requestedApproverIdentity: "@devinschumacher",
    });

    const outside = spawnSync(process.execPath, commandArgs(
      "/tmp/private-source.sql",
      path.join(evidenceRoot, "synthetic.sql"),
      path.join(evidenceRoot, "synthetic.manifest.json"),
    ), { cwd: repoRoot, env: process.env, encoding: "utf8" });
    expect(outside.status).toBe(1);
    expect(outside.stderr).toMatch(/raw input.*tmp\/production-sensitive/i);
  });

  it("deletes the constrained raw input when workflow request metadata is absent", () => {
    const tempDir = mkdtempSync(path.join(evidenceRoot, "sanitize-context-failure-"));
    const rawDir = mkdtempSync(path.join(rawRoot, "sanitize-context-failure-"));
    const inputPath = path.join(rawDir, "private-source.sql");
    writeFileSync(inputPath, "INSERT INTO users VALUES ('private');\n");
    try {
      const result = spawnSync(process.execPath, [
        ...commandArgs(inputPath, path.join(tempDir, "out.sql"), path.join(tempDir, "manifest.json")),
        "--execute",
      ], { cwd: repoRoot, env: { PATH: process.env.PATH }, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/workflow.*context/i);
      expect(existsSync(inputPath)).toBe(false);
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
      rmSync(rawDir, { recursive: true, force: true });
    }
  });

  it("refuses an evidence-directory symlink that escapes to a raw file outside it", () => {
    const evidenceDir = mkdtempSync(path.join(evidenceRoot, "sanitize-symlink-"));
    const rawDir = mkdtempSync(path.join(rawRoot, "sanitize-symlink-"));
    const outsideDir = mkdtempSync(path.join(tmpdir(), "sanitize-outside-"));
    const outsidePath = path.join(outsideDir, "private.sql");
    const linkPath = path.join(rawDir, "private.sql");
    writeFileSync(outsidePath, "INSERT INTO users VALUES ('private');");
    symlinkSync(outsidePath, linkPath);
    try {
      const result = spawnSync(process.execPath, commandArgs(
        linkPath,
        path.join(evidenceDir, "out.sql"),
        path.join(evidenceDir, "manifest.json"),
      ), { cwd: repoRoot, env: process.env, encoding: "utf8" });
      expect(result.status).toBe(1);
      expect(result.stderr).toMatch(/raw input.*tmp\/production-sensitive/i);
      expect(existsSync(outsidePath)).toBe(true);
    } finally {
      rmSync(evidenceDir, { recursive: true, force: true });
      rmSync(rawDir, { recursive: true, force: true });
      rmSync(outsideDir, { recursive: true, force: true });
    }
  });

  it("deletes raw input on sanitizer failure and on success", () => {
    for (const [name, rawExport, expectedStatus] of [
      ["failure", "CREATE TABLE private_data (value TEXT);", 1],
      ["success", validRawExport, 0],
    ]) {
      const tempDir = mkdtempSync(path.join(evidenceRoot, `sanitize-${name}-`));
      const rawDir = mkdtempSync(path.join(rawRoot, `sanitize-${name}-`));
      const inputPath = path.join(rawDir, "private-source.sql");
      const outputPath = path.join(tempDir, "out.sql");
      const manifestPath = path.join(tempDir, "manifest.json");
      writeFileSync(inputPath, rawExport);
      try {
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
        }
      } finally {
        rmSync(tempDir, { recursive: true, force: true });
        rmSync(rawDir, { recursive: true, force: true });
      }
    }
  });
});
