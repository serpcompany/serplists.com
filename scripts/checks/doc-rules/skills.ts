import { parse } from "yaml";
import { z } from "zod";

export const skillCatalog = "docs/agents/code.md";
const DESCRIPTION_LIMIT = 1024;
const SKILL = /^\.claude\/skills\/([^/]+)\/SKILL\.md$/;

const skillFields = z.object({ name: z.unknown(), description: z.unknown() }).passthrough();

function frontmatter(text: string): z.infer<typeof skillFields> | undefined {
  const block = /^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/.exec(text)?.[1];
  if (block === undefined) return undefined;
  try {
    return skillFields.safeParse(parse(block)).data;
  } catch {
    return undefined;
  }
}

export function skillProblems(path: string, text: string, catalogLinks: readonly string[]): string[] {
  const folder = SKILL.exec(path)?.[1];
  if (folder === undefined) return [];
  const fields = frontmatter(text);
  if (fields === undefined) return ["has no YAML frontmatter between --- lines, which Claude Code reads the skill from"];
  const problems: string[] = [];
  if (fields.name !== folder) problems.push(`is named ${String(fields.name)}, not ${folder}, its folder's name`);
  if (typeof fields.description !== "string" || !fields.description.trim()) {
    problems.push("has no description, which is how an agent knows when to use it");
  } else if (fields.description.length > DESCRIPTION_LIMIT) {
    problems.push(`has a description of ${fields.description.length} characters, over the Agent Skills limit of ${DESCRIPTION_LIMIT}`);
  }
  if (!catalogLinks.includes(path)) problems.push(`isn't listed in ${skillCatalog}'s Skills table`);
  return problems;
}

export function foldersWithoutASkill(files: readonly string[]): string[] {
  const folders = new Set(files.flatMap((file) => /^(\.claude\/skills\/[^/]+)\//.exec(file)?.[1] ?? []));
  return [...folders].filter((folder) => !files.includes(`${folder}/SKILL.md`)).sort();
}
