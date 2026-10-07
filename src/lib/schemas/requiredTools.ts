import { z } from "zod";

import { parseJsonArray } from "./jsonArrays";

export const REQUIRED_TOOLS_MAX = 20;
export const REQUIRED_TOOL_NAME_MAX = 80;
export const REQUIRED_TOOL_URL_MAX = 2048;
export const PUBLIC_REQUIRED_TOOLS_TEMPLATES_MAX = 50;

const NOT_BLANK = /\S/;
export const HTTP_URL = /^[Hh][Tt][Tt][Pp][Ss]?:\/\/[^\s<>"/?#]+[^\s<>"]*$/;

const toolName = z.string().regex(NOT_BLANK, "Give each tool a name");
const toolUrl = z.string().regex(HTTP_URL, "Tool URLs must start with http:// or https://");

export const portableRequiredToolSchema = z.object({
  name: toolName,
  url: toolUrl,
  required: z.boolean().default(true),
});

export const requiredToolSchema = portableRequiredToolSchema.extend({
  name: toolName.max(REQUIRED_TOOL_NAME_MAX, `Tool names must be ${REQUIRED_TOOL_NAME_MAX} characters or fewer`),
  url: toolUrl.max(REQUIRED_TOOL_URL_MAX, `Tool URLs must be ${REQUIRED_TOOL_URL_MAX} characters or fewer`),
});

export const requiredToolsSchema = z
  .array(requiredToolSchema)
  .max(REQUIRED_TOOLS_MAX, `Add ${REQUIRED_TOOLS_MAX} tools or fewer`);

export type RequiredTool = z.infer<typeof requiredToolSchema>;

export function readRequiredTools(value: unknown): RequiredTool[] {
  return (parseJsonArray(value) ?? [])
    .flatMap((entry) => {
      const parsed = requiredToolSchema.safeParse(entry);
      return parsed.success ? [parsed.data] : [];
    })
    .slice(0, REQUIRED_TOOLS_MAX);
}

export function toStoredRequiredTools(tools: readonly RequiredTool[] | undefined): string | null {
  if (!tools || tools.length === 0) return null;
  return JSON.stringify(tools.map(({ name, url, required }) => ({ name: name.trim(), url, required })));
}
