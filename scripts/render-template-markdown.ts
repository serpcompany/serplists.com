import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import path from "node:path";
import { portableChecklistTemplateSchema } from "../src/lib/schemas/checklistSchema";
import { normalizePortableTemplate } from "../src/lib/templates/portableTemplateNormalization";
import { renderTemplateMarkdown } from "../src/lib/templates/templateMarkdown";

const run = async () => {
  const [inputArg, outputArg] = process.argv.slice(2);
  if (!inputArg) {
    throw new Error("Usage: pnpm tsx scripts/render-template-markdown.ts <template.json> [output.md]\nFor the YAML-first workflow use: pnpm templates:generate <template.yaml>");
  }

  const inputPath = path.resolve(inputArg);
  const outputPath = path.resolve(outputArg ?? path.join(path.dirname(inputPath), "template.md"));
  const inputInfo = await stat(inputPath);
  if (!inputInfo.isFile()) {
    throw new Error(`Input path is not a file: ${inputPath}`);
  }

  const rawJson = await readFile(inputPath, "utf8");
  const normalizedTemplate = normalizePortableTemplate(
    portableChecklistTemplateSchema.parse(JSON.parse(rawJson))
  );

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, renderTemplateMarkdown(normalizedTemplate), "utf8");
  console.log(`Wrote ${path.relative(process.cwd(), outputPath)}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
