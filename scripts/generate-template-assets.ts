import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { parseTemplateYaml, renderTemplateMarkdown, renderTemplatePreviewHtml, renderTemplateReadme } from "../src/lib/templates/templateMarkdown";

const normalizeJson = (value: unknown) => `${JSON.stringify(value, null, 2)}\n`;

const run = async () => {
  const [inputArg, outputDirArg] = process.argv.slice(2);
  if (!inputArg) {
    throw new Error("Usage: pnpm tsx scripts/generate-template-assets.ts <template.yaml> [output-dir]");
  }

  const inputPath = path.resolve(inputArg);
  const inputInfo = await stat(inputPath);
  if (!inputInfo.isFile()) {
    throw new Error(`Input path is not a file: ${inputPath}`);
  }

  const outputDir = path.resolve(outputDirArg ?? path.dirname(inputPath));
  const rawYaml = await readFile(inputPath, "utf8");
  const parsed = parseTemplateYaml(rawYaml);
  if ("kind" in parsed) {
    throw new Error("Template asset generation expects a single-template YAML source, not a template pack");
  }

  await mkdir(outputDir, { recursive: true });

  await Promise.all([
    writeFile(path.join(outputDir, "template.json"), normalizeJson(parsed), "utf8"),
    writeFile(path.join(outputDir, "template.md"), renderTemplateMarkdown(parsed), "utf8"),
    writeFile(path.join(outputDir, "README.md"), renderTemplateReadme(parsed), "utf8"),
    writeFile(path.join(outputDir, "preview.html"), renderTemplatePreviewHtml(parsed), "utf8"),
  ]);

  console.log(`Wrote ${path.relative(process.cwd(), outputDir)}/template.json`);
  console.log(`Wrote ${path.relative(process.cwd(), outputDir)}/template.md`);
  console.log(`Wrote ${path.relative(process.cwd(), outputDir)}/README.md`);
  console.log(`Wrote ${path.relative(process.cwd(), outputDir)}/preview.html`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
