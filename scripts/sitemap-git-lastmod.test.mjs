import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

const generatorPath = path.resolve("scripts/generate-sitemap-catalog.ts");
const tsxPath = path.resolve("node_modules/.bin/tsx");
const staticSources = [
  "src/pages/Index.tsx",
  "src/pages/Features.tsx",
  "src/pages/Pricing.tsx",
  "src/pages/About.tsx",
  "src/pages/Contact.tsx",
  "src/pages/ChecklistLibrary.tsx",
  "src/pages/Categories.tsx",
];
const implementationSources = [
  "functions/sitemap.xml.ts",
  "functions/sitemap/shared.ts",
  "functions/sitemaps/pages/[page].xml.ts",
  "functions/sitemaps/categories/[page].xml.ts",
  "functions/sitemaps/profiles/[page].xml.ts",
  "functions/sitemaps/templates/[page].xml.ts",
];

function git(repoRoot, args, date) {
  return execFileSync("git", args, {
    cwd: repoRoot,
    encoding: "utf8",
    env: date
      ? { ...process.env, GIT_AUTHOR_DATE: date, GIT_COMMITTER_DATE: date }
      : process.env,
  }).trim();
}

function write(repoRoot, relativePath, contents) {
  const destination = path.join(repoRoot, relativePath);
  mkdirSync(path.dirname(destination), { recursive: true });
  writeFileSync(destination, contents);
}

function runGenerator(repoRoot, ...args) {
  return spawnSync(tsxPath, [generatorPath, ...args], {
    cwd: repoRoot,
    encoding: "utf8",
  });
}

function createGeneratorRepository(repoRoot) {
  git(repoRoot, ["init", "-b", "main"]);
  git(repoRoot, ["config", "user.email", "sitemap-test@example.invalid"]);
  git(repoRoot, ["config", "user.name", "Sitemap Test"]);
  for (const source of [...staticSources, ...implementationSources]) {
    write(repoRoot, source, `export const source = ${JSON.stringify(source)};\n`);
  }
  write(repoRoot, "src/data/publicCategories.ts", "export const categories = ['Synthetic'];\n");
  write(repoRoot, "src/data/public-template-packs/synthetic.json", JSON.stringify({
    exportedAt: "2026-01-02T00:00:00.000Z",
    templates: [{ slug: "synthetic", visibility: "public", categories: ["Synthetic"] }],
  }, null, 2));
  git(repoRoot, ["add", "."]);
  git(repoRoot, ["commit", "-m", "author sitemap sources"], "2026-01-02T03:04:05Z");
  const generated = runGenerator(repoRoot);
  expect(generated.status, generated.stderr).toBe(0);
  git(repoRoot, ["add", "functions/sitemap/bundled-catalog.generated.json"]);
  git(repoRoot, ["commit", "-m", "record generated catalog"], "2026-01-03T00:00:00Z");
}

describe("sitemap catalog Git history", () => {
  it("accepts unchanged full-history merges, rejects stale content, and blocks shallow merge history", () => {
    const source = mkdtempSync(path.join(tmpdir(), "sitemap-generator-source-"));
    const shallowParent = mkdtempSync(path.join(tmpdir(), "sitemap-generator-shallow-"));
    const shallow = path.join(shallowParent, "repo");
    try {
      createGeneratorRepository(source);
      const branchCatalog = readFileSync(
        path.join(source, "functions/sitemap/bundled-catalog.generated.json"),
        "utf8",
      );

      git(source, ["checkout", "-b", "feature"]);
      write(source, "feature-only.txt", "feature\n");
      git(source, ["add", "feature-only.txt"]);
      git(source, ["commit", "-m", "feature without sitemap changes"], "2026-02-01T00:00:00Z");
      git(source, ["checkout", "main"]);
      write(source, "base-only.txt", "base\n");
      git(source, ["add", "base-only.txt"]);
      git(source, ["commit", "-m", "advance base"], "2026-03-01T00:00:00Z");
      git(source, ["merge", "--no-ff", "feature", "-m", "synthetic pull request merge"], "2026-04-01T00:00:00Z");

      const merged = runGenerator(source, "--check");
      expect(merged.status, merged.stderr).toBe(0);
      expect(readFileSync(
        path.join(source, "functions/sitemap/bundled-catalog.generated.json"),
        "utf8",
      )).toBe(branchCatalog);

      execFileSync("git", ["clone", "--depth", "1", "--branch", "main", `file://${source}`, shallow]);
      const shallowCheck = runGenerator(shallow, "--check");
      expect(shallowCheck.status).not.toBe(0);
      expect(shallowCheck.stderr).toContain("Full Git history is required for sitemap lastmod");

      write(source, "src/pages/Index.tsx", "export const source = 'changed in pull request';\n");
      git(source, ["commit", "-am", "change indexed page"], "2026-05-01T00:00:00Z");
      const stale = runGenerator(source, "--check");
      expect(stale.status).not.toBe(0);
      expect(stale.stderr).toContain("Generated sitemap catalog is stale");
    } finally {
      rmSync(source, { recursive: true, force: true });
      rmSync(shallowParent, { recursive: true, force: true });
    }
  });
});
