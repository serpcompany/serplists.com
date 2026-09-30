import type { PortableChecklistTemplate } from "../../src/lib/schemas/checklistSchema";
import { normalizePortableTemplate } from "../../src/lib/templates/portableTemplateNormalization";
import { formatBytes, inferEmbedProvider } from "./templateAssetLabels";
import { escapeTemplateMarkdownDescription } from "../../src/lib/templates/templateMarkdownBody";

const renderReadmeContentBlock = (content: NonNullable<PortableChecklistTemplate["sections"][number]["items"][number]["contents"]>[number]) => {
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

  return `**${inferEmbedProvider(content.value)}**\n\n${content.value}`;
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
