import yaml from "js-yaml";
import { z } from "zod";
import {
  portableChecklistTemplateSchema,
  portableTemplatePackSchema,
  type PortableChecklistTemplate,
  type PortableTemplatePack,
} from "@/lib/schemas/checklistSchema";
import {
  normalizePortableTemplate,
  normalizePortableTemplatePack,
  trimOptionalString,
} from "@/lib/templates/portableTemplateNormalization";
import {
  escapeTemplateMarkdownDescription,
  parseTemplateMarkdownBody,
  renderTemplateMarkdownBlock,
} from "@/lib/templates/templateMarkdownBody";

const frontmatterSchema = z.object({
  title: z.unknown(),
  type: z.unknown(),
  slug: z.unknown(),
  seoTitle: z.unknown(),
  seoDescription: z.unknown(),
  visibility: z.unknown(),
  categories: z.unknown(),
  tags: z.unknown(),
  rules: z.unknown(),
  requiredTools: z.unknown(),
}).passthrough();
const mediaBlockSchema = z.object({
  value: z.unknown(),
  uploadType: z.unknown(),
  fileName: z.unknown(),
  fileSize: z.unknown(),
}).passthrough();
const titledEntrySchema = z.object({ title: z.string() });

const FRONTMATTER_DELIMITER = "---";
const TEMPLATE_TITLE_PREFIX = "# ";
const SECTION_PREFIX = "## ";
const ITEM_PREFIX = "### ";

type SupportedMarkdownExtension = ".md" | ".markdown";
type SupportedYamlExtension = ".yaml" | ".yml";

export type SupportedTemplateSourceExtension =
  | ".json"
  | SupportedMarkdownExtension
  | SupportedYamlExtension;

const normalizeLineEndings = (value: string) => value.replace(/\r\n/g, "\n");

const dumpYaml = (value: unknown) =>
  yaml.dump(value, {
    noRefs: true,
    lineWidth: 120,
    sortKeys: false,
  }).trim();

const buildFrontmatter = (template: PortableChecklistTemplate) => {
  const normalized = normalizePortableTemplate(template);
  const frontmatter = {
    title: normalized.title,
    ...(normalized.type ? { type: normalized.type } : {}),
    ...(normalized.slug ? { slug: normalized.slug } : {}),
    ...(normalized.visibility ? { visibility: normalized.visibility } : {}),
    ...(normalized.seoTitle ? { seoTitle: normalized.seoTitle } : {}),
    ...(normalized.seoDescription ? { seoDescription: normalized.seoDescription } : {}),
    ...(normalized.categories ? { categories: normalized.categories } : {}),
    ...(normalized.tags ? { tags: normalized.tags } : {}),
    ...(normalized.rules ? { rules: normalized.rules } : {}),
    ...(normalized.requiredTools ? { requiredTools: normalized.requiredTools } : {}),
  };

  return `${FRONTMATTER_DELIMITER}\n${dumpYaml(frontmatter)}\n${FRONTMATTER_DELIMITER}`;
};

const renderYamlContentBlock = (blockType: string, value: unknown) =>
  renderTemplateMarkdownBlock(blockType, dumpYaml(value));

const renderContentBlocks = (contents?: PortableChecklistTemplate["sections"][number]["items"][number]["contents"]) => {
  if (!Array.isArray(contents) || contents.length === 0) return [];

  return contents.map((content) => {
    if (content.type === "text" || content.type === "embed") {
      return renderTemplateMarkdownBlock(content.type, (content.value ?? "").trim());
    }

    if (content.type === "subItems") {
      const payload = (content.subItems ?? []).map((subItem) => subItem.title);
      return renderYamlContentBlock("subItems", payload);
    }

    return renderYamlContentBlock(content.type, {
      value: (content.value ?? "").trim(),
      ...(content.uploadType ? { uploadType: content.uploadType } : {}),
      ...(trimOptionalString(content.fileName) ? { fileName: trimOptionalString(content.fileName) } : {}),
      ...(typeof content.fileSize === "number" ? { fileSize: content.fileSize } : {}),
    });
  });
};

export const renderTemplateMarkdown = (template: PortableChecklistTemplate) => {
  const normalized = normalizePortableTemplate(template);
  const parts: string[] = [
    buildFrontmatter(normalized),
    `${TEMPLATE_TITLE_PREFIX}${normalized.title}`,
  ];

  if (normalized.description) {
    parts.push(escapeTemplateMarkdownDescription(normalized.description));
  }

  normalized.sections.forEach((section) => {
    parts.push(`${SECTION_PREFIX}${section.title}`);

    section.items.forEach((item) => {
      parts.push(`${ITEM_PREFIX}${item.title}`);

      if (item.description) {
        parts.push(escapeTemplateMarkdownDescription(item.description));
      }

      const blocks = renderContentBlocks(item.contents);
      if (blocks.length > 0) {
        parts.push(...blocks);
      }
    });
  });

  return `${parts.join("\n\n").trim()}\n`;
};

const extractFrontmatter = (markdown: string) => {
  const source = normalizeLineEndings(markdown);
  if (!source.startsWith(`${FRONTMATTER_DELIMITER}\n`)) {
    throw new Error("Markdown template must start with YAML frontmatter");
  }

  const closingIndex = source.indexOf(`\n${FRONTMATTER_DELIMITER}\n`, FRONTMATTER_DELIMITER.length + 1);
  if (closingIndex === -1) {
    throw new Error("Markdown template is missing a closing YAML frontmatter delimiter");
  }

  const rawFrontmatter = source.slice(FRONTMATTER_DELIMITER.length + 1, closingIndex);
  const body = source.slice(closingIndex + `\n${FRONTMATTER_DELIMITER}\n`.length);

  const frontmatter = frontmatterSchema.safeParse(yaml.load(rawFrontmatter));
  if (!frontmatter.success) {
    throw new Error("Markdown template frontmatter must be a YAML object");
  }

  return {
    frontmatter: frontmatter.data,
    body,
  };
};

const parseMediaBlock = (rawBlock: string) => {
  const parsed = mediaBlockSchema.safeParse(yaml.load(rawBlock.trim()));
  if (!parsed.success) {
    throw new Error("Expected a YAML object block");
  }
  return parsed.data;
};

const parseSubItemsBlock = (rawBlock: string) => {
  const parsed = yaml.load(rawBlock.trim());
  if (!Array.isArray(parsed)) {
    throw new Error("Sub-items block must be a YAML array");
  }

  return parsed.map((entry: unknown) => {
    if (typeof entry === "string") return { title: entry.trim() };
    const titled = titledEntrySchema.safeParse(entry);
    if (titled.success) return { title: titled.data.title.trim() };
    throw new Error("Sub-items block entries must be strings or objects with a title");
  });
};

export const parseTemplateMarkdown = (markdown: string): PortableChecklistTemplate => {
  const { frontmatter, body } = extractFrontmatter(markdown);
  const normalizedBody = normalizeLineEndings(body).trim();

  let remainingBody = normalizedBody;
  if (remainingBody.startsWith(TEMPLATE_TITLE_PREFIX)) {
    const endOfTitle = remainingBody.indexOf("\n");
    const markdownTitle = remainingBody
      .slice(TEMPLATE_TITLE_PREFIX.length, endOfTitle === -1 ? undefined : endOfTitle)
      .trim();
    if (typeof frontmatter.title === "string" && markdownTitle && markdownTitle !== frontmatter.title.trim()) {
      throw new Error("Markdown title heading must match frontmatter title");
    }
    remainingBody = endOfTitle === -1 ? "" : remainingBody.slice(endOfTitle + 1).trim();
  }

  const { description: templateDescription, sections: sectionBlocks } =
    parseTemplateMarkdownBody(remainingBody);

  const sections = sectionBlocks.map((sectionBlock) => {
    if (sectionBlock.items.length === 0) {
      throw new Error(`Section "${sectionBlock.title}" must include at least one item`);
    }

    return {
      title: sectionBlock.title,
      items: sectionBlock.items.map((itemBlock) => {
        const { description, blocks } = itemBlock;
        const contents = blocks.map((block) => {
          if (block.type === "text") {
            return {
              type: "text" as const,
              value: block.body,
            };
          }

          if (block.type === "embed") {
            return {
              type: "embed" as const,
              value: block.body,
            };
          }

          if (block.type === "subItems") {
            return {
              type: "subItems" as const,
              value: "",
              subItems: parseSubItemsBlock(block.body),
            };
          }

          if (block.type === "image" || block.type === "video" || block.type === "file") {
            const parsedBlock = parseMediaBlock(block.body);
            return {
              type: block.type,
              value: typeof parsedBlock.value === "string" ? parsedBlock.value : "",
              uploadType:
                parsedBlock.uploadType === "url" || parsedBlock.uploadType === "upload"
                  ? parsedBlock.uploadType
                  : undefined,
              fileName: typeof parsedBlock.fileName === "string" ? parsedBlock.fileName : undefined,
              fileSize: typeof parsedBlock.fileSize === "number" ? parsedBlock.fileSize : undefined,
            };
          }

          throw new Error(`Unsupported content block type "${block.type}"`);
        });

        return {
          title: itemBlock.title,
          ...(description ? { description } : {}),
          ...(contents.length > 0 ? { contents } : {}),
        };
      }),
    };
  });

  const template = {
    title: typeof frontmatter.title === "string" ? frontmatter.title.trim() : "",
    ...(templateDescription ? { description: templateDescription } : {}),
    ...(frontmatter.type === "checklist" || frontmatter.type === "recipe" ? { type: frontmatter.type } : {}),
    ...(typeof frontmatter.slug === "string" ? { slug: frontmatter.slug.trim() } : {}),
    ...(typeof frontmatter.seoTitle === "string" ? { seoTitle: frontmatter.seoTitle.trim() } : {}),
    ...(typeof frontmatter.seoDescription === "string" ? { seoDescription: frontmatter.seoDescription.trim() } : {}),
    ...(frontmatter.visibility === "public" || frontmatter.visibility === "private"
      ? { visibility: frontmatter.visibility }
      : {}),
    ...(Array.isArray(frontmatter.categories) ? { categories: frontmatter.categories } : {}),
    ...(Array.isArray(frontmatter.tags) ? { tags: frontmatter.tags } : {}),
    ...(Array.isArray(frontmatter.rules) ? { rules: frontmatter.rules } : {}),
    ...(Array.isArray(frontmatter.requiredTools) ? { requiredTools: frontmatter.requiredTools } : {}),
    sections,
  };

  return normalizePortableTemplate(portableChecklistTemplateSchema.parse(template));
};

export const parseTemplateYaml = (source: string): PortableChecklistTemplate | PortableTemplatePack => {
  const parsed = yaml.load(normalizeLineEndings(source));
  if (!parsed || typeof parsed !== "object") {
    throw new Error("YAML template source must be an object");
  }

  if ("kind" in parsed && parsed.kind === "serplists-template-pack") {
    return normalizePortableTemplatePack(portableTemplatePackSchema.parse(parsed));
  }

  return normalizePortableTemplate(portableChecklistTemplateSchema.parse(parsed));
};

export const detectTemplateSourceExtension = (fileName: string): SupportedTemplateSourceExtension | null => {
  const lower = fileName.toLowerCase();
  if (lower.endsWith(".json")) return ".json";
  if (lower.endsWith(".md")) return ".md";
  if (lower.endsWith(".markdown")) return ".markdown";
  if (lower.endsWith(".yaml")) return ".yaml";
  if (lower.endsWith(".yml")) return ".yml";
  return null;
};

export const isMarkdownTemplateExtension = (extension: SupportedTemplateSourceExtension | null): extension is SupportedMarkdownExtension =>
  extension === ".md" || extension === ".markdown";

export const isYamlTemplateExtension = (extension: SupportedTemplateSourceExtension | null): extension is SupportedYamlExtension =>
  extension === ".yaml" || extension === ".yml";
