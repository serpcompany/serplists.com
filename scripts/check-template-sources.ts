import { readdir, stat } from "node:fs/promises";
import path from "node:path";
import { lintSingleTemplateSource, lintTemplatePair, lintYamlTemplateBundle, type TemplateLintIssue } from "./lib/templateLint";

const EXCLUDED_DIRS = new Set([
  ".git",
  "node_modules",
  "dist",
  "coverage",
  ".wrangler",
  "playwright-report",
  "test-results",
]);

const isTemplateFile = (fileName: string) => {
  const lower = fileName.toLowerCase();
  return lower === "template.json"
    || lower === "template.md"
    || lower === "template.yaml"
    || lower === "template.yml"
    || lower === "preview.html";
};

const collectTargets = async (entryPath: string, files: string[]) => {
  const info = await stat(entryPath);
  if (info.isFile()) {
    if (isTemplateFile(path.basename(entryPath))) files.push(entryPath);
    return;
  }

  if (!info.isDirectory()) return;

  const dirName = path.basename(entryPath);
  if (EXCLUDED_DIRS.has(dirName)) return;

  const entries = await readdir(entryPath, { withFileTypes: true });
  const entryNames = new Set(entries.map((entry) => entry.name.toLowerCase()));
  const hasYamlTemplate = entryNames.has("template.yaml") || entryNames.has("template.yml");
  await Promise.all(entries.map(async (entry) => {
    const childPath = path.join(entryPath, entry.name);
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) {
        await collectTargets(childPath, files);
      }
      return;
    }
    if (entry.isFile() && (isTemplateFile(entry.name) || (hasYamlTemplate && entry.name.toLowerCase() === "readme.md"))) {
      files.push(childPath);
    }
  }));
};

const groupByDirectory = (files: string[]) => {
  const grouped = new Map<string, Set<string>>();
  files.forEach((filePath) => {
    const dirPath = path.dirname(filePath);
    if (!grouped.has(dirPath)) grouped.set(dirPath, new Set());
    grouped.get(dirPath)?.add(path.basename(filePath).toLowerCase());
  });
  return grouped;
};

const formatIssue = (issue: TemplateLintIssue) => `${issue.filePath}: [${issue.code}] ${issue.message}`;

const run = async () => {
  const cliTargets = process.argv.slice(2);
  const roots = cliTargets.length > 0 ? cliTargets : [process.cwd()];
  const templateFiles: string[] = [];

  for (const root of roots) {
    await collectTargets(path.resolve(root), templateFiles);
  }

  const uniqueFiles = [...new Set(templateFiles)].sort();
  const grouped = groupByDirectory(uniqueFiles);
  const issues: TemplateLintIssue[] = [];
  const pairedFiles = new Set<string>();

  for (const [dirPath, names] of grouped.entries()) {
    if (names.has("template.yaml") || names.has("template.yml")) {
      const yamlName = names.has("template.yaml") ? "template.yaml" : "template.yml";
      issues.push(...await lintYamlTemplateBundle(path.join(dirPath, yamlName), {
        jsonPath: names.has("template.json") ? path.join(dirPath, "template.json") : undefined,
        readmePath: names.has("readme.md") ? path.join(dirPath, "README.md") : undefined,
        previewHtmlPath: names.has("preview.html") ? path.join(dirPath, "preview.html") : undefined,
        markdownPath: names.has("template.md") ? path.join(dirPath, "template.md") : undefined,
      }));
      pairedFiles.add(path.join(dirPath, yamlName));
      if (names.has("template.json")) pairedFiles.add(path.join(dirPath, "template.json"));
      if (names.has("readme.md")) pairedFiles.add(path.join(dirPath, "README.md"));
      if (names.has("preview.html")) pairedFiles.add(path.join(dirPath, "preview.html"));
      if (names.has("template.md")) pairedFiles.add(path.join(dirPath, "template.md"));
      continue;
    }

    if (names.has("template.json") && names.has("template.md")) {
      const jsonPath = path.join(dirPath, "template.json");
      const markdownPath = path.join(dirPath, "template.md");
      issues.push(...await lintTemplatePair(jsonPath, markdownPath));
      pairedFiles.add(jsonPath);
      pairedFiles.add(markdownPath);
    }
  }

  for (const filePath of uniqueFiles) {
    if (pairedFiles.has(filePath)) continue;
    issues.push(...await lintSingleTemplateSource(filePath));
  }

  if (issues.length > 0) {
    issues.forEach((issue) => console.error(formatIssue(issue)));
    process.exit(1);
  }

  console.log(`Template sources OK (${uniqueFiles.length} file${uniqueFiles.length === 1 ? "" : "s"} checked)`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
