import { z } from "zod";

import {
  REQUIRED_TOOL_NAME_MAX,
  REQUIRED_TOOL_URL_MAX,
  REQUIRED_TOOLS_MAX,
  requiredToolSchema,
  type RequiredTool,
} from "@/lib/schemas/requiredTools";

export const templateEditorRequiredToolSchema = z.object({
  name: z.string(),
  url: z.string(),
  required: z.boolean(),
});

export type TemplateEditorRequiredTool = z.infer<typeof templateEditorRequiredToolSchema>;

export const createTemplateEditorRequiredTool = (): TemplateEditorRequiredTool => ({ name: "", url: "", required: true });

export const toTemplateEditorRequiredTools = (tools: readonly RequiredTool[] | undefined): TemplateEditorRequiredTool[] =>
  (tools ?? []).map(({ name, url, required }) => ({ name, url, required }));

const isBlank = (tool: TemplateEditorRequiredTool): boolean => !tool.name.trim() && !tool.url.trim();

const trimmed = (tool: TemplateEditorRequiredTool): RequiredTool => ({
  name: tool.name.trim(),
  url: tool.url.trim(),
  required: tool.required,
});

export const normalizeTemplateEditorRequiredTools = (tools: readonly TemplateEditorRequiredTool[]): RequiredTool[] =>
  tools.filter((tool) => !isBlank(tool)).map(trimmed);

const LABEL = "Required tools";

function toolIssues(tool: RequiredTool, number: number): string[] {
  const result = requiredToolSchema.safeParse(tool);
  if (result.success) return [];
  const fields = new Set(result.error.issues.map((issue) => issue.path[0]));
  const nameIssue = tool.name
    ? `${LABEL}: tool ${number}'s name must be ${REQUIRED_TOOL_NAME_MAX} characters or fewer.`
    : `${LABEL}: give tool ${number} a name.`;
  const urlIssue = tool.url.length > REQUIRED_TOOL_URL_MAX
    ? `${LABEL}: tool ${number}'s URL must be ${REQUIRED_TOOL_URL_MAX} characters or fewer.`
    : `${LABEL}: tool ${number}'s URL must start with http:// or https:// and have no spaces.`;
  return [...(fields.has("name") ? [nameIssue] : []), ...(fields.has("url") ? [urlIssue] : [])];
}

export function findTemplateEditorRequiredToolsIssues(tools: readonly TemplateEditorRequiredTool[]): string[] {
  const filled = tools.flatMap((tool, index) => (isBlank(tool) ? [] : [{ tool: trimmed(tool), number: index + 1 }]));
  return [
    ...(filled.length > REQUIRED_TOOLS_MAX ? [`${LABEL}: use ${REQUIRED_TOOLS_MAX} or fewer.`] : []),
    ...filled.flatMap(({ tool, number }) => toolIssues(tool, number)),
  ];
}
