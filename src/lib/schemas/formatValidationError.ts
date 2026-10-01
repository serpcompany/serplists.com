import { z } from "zod";

const MAX_ISSUES = 3;

const ARRAY_FIELD_LABELS: Record<string, string> = {
  templates: "Template",
  sections: "Section",
  items: "Item",
  contents: "Content block",
  subItems: "Sub-item",
  rules: "Rule",
  categories: "Category",
  tags: "Tag",
};

const yamlExceptionSchema = z.object({
  name: z.literal("YAMLException"),
  reason: z.string(),
  mark: z.object({ line: z.number() }).nullish(),
});

const describePath = (path: (string | number)[]): string => {
  const parts: string[] = [];
  for (let index = 0; index < path.length; index += 1) {
    const segment = path[index];
    const next = path[index + 1];
    if (typeof segment === "number") {
      const isTemplateInArrayFile = index === 0;
      parts.push(isTemplateInArrayFile ? `Template ${segment + 1}` : `#${segment + 1}`);
    } else if (typeof next === "number") {
      parts.push(`${ARRAY_FIELD_LABELS[segment] ?? segment} ${next + 1}`);
      index += 1;
    } else {
      parts.push(segment);
    }
  }
  return parts.join(" > ");
};

const issueDepth = (error: z.ZodError): number =>
  Math.max(0, ...error.issues.map((issue) => issue.path.length));

const issuesOfDeepestUnionBranch = (issue: z.ZodIssue): z.ZodIssue[] => {
  if (issue.code !== z.ZodIssueCode.invalid_union || issue.unionErrors.length === 0) {
    return [issue];
  }
  const deepest = issue.unionErrors.reduce((best, candidate) =>
    issueDepth(candidate) > issueDepth(best) ? candidate : best,
  );
  return deepest.issues.length > 0 ? deepest.issues.flatMap(issuesOfDeepestUnionBranch) : [issue];
};

const formatIssue = (issue: z.ZodIssue): string => {
  const message = issue.message.replace(/\s+/g, " ").trim();
  const location = describePath(issue.path);
  return location ? `${location}: ${message}` : message;
};

export const formatZodIssues = (error: z.ZodError, maxIssues = MAX_ISSUES): string => {
  const lines = Array.from(new Set(error.issues.flatMap(issuesOfDeepestUnionBranch).map(formatIssue)));
  if (lines.length === 0) return "Invalid data";
  const shown = lines.slice(0, maxIssues).join("; ");
  const hidden = lines.length - maxIssues;
  return hidden > 0 ? `${shown} (and ${hidden} more)` : shown;
};

export const formatValidationError = (error: unknown): string => {
  if (error instanceof z.ZodError) {
    return formatZodIssues(error);
  }

  const yamlError = yamlExceptionSchema.safeParse(error);
  if (yamlError.success) {
    const { mark, reason } = yamlError.data;
    return `Invalid YAML${mark ? ` at line ${mark.line + 1}` : ""}: ${reason}`;
  }

  return error instanceof Error ? error.message : "Unknown error";
};
