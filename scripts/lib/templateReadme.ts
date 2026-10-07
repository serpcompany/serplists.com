import type { PortableChecklistTemplate } from "../../src/lib/schemas/checklistSchema";
import { normalizePortableTemplate } from "../../src/lib/templates/portableTemplateNormalization";
import {
  describeFormField,
  formatBytes,
  formFieldOptionLabels,
  inferEmbedProvider,
  type PortableFormField,
} from "./templateAssetLabels";
import { escapeTemplateMarkdownDescription } from "../../src/lib/templates/templateMarkdownBody";

const renderReadmeFormField = (field: PortableFormField) => {
  const options = formFieldOptionLabels(field);
  return [
    `- ${field.label} (${describeFormField(field)})${field.description ? `: ${field.description}` : ""}`,
    ...(options.length ? [`  - Options: ${options.join(", ")}`] : []),
  ].join("\n");
};

const renderReadmeContentBlock = (content: NonNullable<PortableChecklistTemplate["sections"][number]["items"][number]["contents"]>[number]): string => {
  if (content.type === "text") {
    return content.value.trim();
  }

  if (content.type === "subItems") {
    const subItems = content.subItems ?? [];
    return [
      "Sub-items:",
      ...subItems.map((subItem) => `- [ ] ${subItem.title}`),
    ].join("\n");
  }

  if (content.type === "form") {
    return ["**Form**", content.fields.map(renderReadmeFormField).join("\n")].join("\n\n");
  }

  if (content.type === "image") {
    const lines = ["**Image**"];
    lines.push(`![${content.fileName || "Image preview"}](${content.value})`);
    lines.push(`Source: ${content.value}`);
    return lines.join("\n\n");
  }

  if (content.type === "video") {
    const lines = ["**Video**"];
    if (content.fileName) lines.push(`File: ${content.fileName}`);
    lines.push(`Watch: ${content.value}`);
    return lines.join("\n\n");
  }

  if (content.type === "file") {
    const lines = ["**File**"];
    lines.push(`[${content.fileName || content.value}](${content.value})`);
    const fileSize = formatBytes(content.fileSize);
    if (fileSize) lines.push(`Size: ${fileSize}`);
    return lines.join("\n\n");
  }

  if (content.type === "embed") {
    return `**${inferEmbedProvider(content.value)}**\n\n${content.value}`;
  }

  const unhandled: never = content;
  return unhandled;
};

export const renderTemplateReadme = (template: PortableChecklistTemplate) => {
  const normalized = normalizePortableTemplate(template);
  const parts: string[] = [`# ${normalized.title}`];

  if (normalized.description) {
    parts.push(escapeTemplateMarkdownDescription(normalized.description));
  }

  if (normalized.categories?.length || normalized.tags?.length) {
    const metadataParts: string[] = [];
    if (normalized.categories?.length) metadataParts.push(`Categories: ${normalized.categories.join(", ")}`);
    if (normalized.tags?.length) metadataParts.push(`Tags: ${normalized.tags.join(", ")}`);
    parts.push(metadataParts.join("\n"));
  }

  if (normalized.requiredTools?.length) {
    parts.push("## Required tools");
    parts.push(normalized.requiredTools
      .map((tool) => `- ${tool.name} (${tool.required ? "required" : "optional"}): <${tool.url}>`)
      .join("\n"));
  }

  normalized.sections.forEach((section) => {
    parts.push(`## ${section.title}`);
    section.items.forEach((item) => {
      parts.push(`- [ ] **${item.title}**`);
      if (item.description) {
        parts.push(escapeTemplateMarkdownDescription(item.description));
      }

      item.contents?.forEach((content) => {
        parts.push(renderReadmeContentBlock(content));
      });
    });
  });

  return `${parts.join("\n\n").trim()}\n`;
};
