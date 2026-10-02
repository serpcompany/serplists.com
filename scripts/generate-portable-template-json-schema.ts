import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH,
  buildPortableTemplatePackJsonSchema,
} from "../src/lib/schemas/portableTemplateJsonSchema";
import { matchesGeneratedText } from "./lib/line-endings.mjs";

const outputPath = path.join(process.cwd(), PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH);
const nextJson = `${JSON.stringify(buildPortableTemplatePackJsonSchema(), null, 2)}\n`;
const checkOnly = process.argv.includes("--check");

const run = async () => {
  let currentJson: string | null = null;

  try {
    currentJson = await readFile(outputPath, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== "ENOENT") {
      throw error;
    }
  }

  if (checkOnly) {
    if (!matchesGeneratedText(currentJson, nextJson)) {
      throw new Error(`Portable template JSON Schema artifact is out of date: ${PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH}`);
    }

    console.log(`Portable template JSON Schema artifact is up to date: ${PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH}`);
    return;
  }

  await mkdir(path.dirname(outputPath), { recursive: true });
  await writeFile(outputPath, nextJson, "utf8");
  console.log(`Wrote ${PORTABLE_TEMPLATE_PACK_JSON_SCHEMA_RELATIVE_PATH}`);
};

run().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
