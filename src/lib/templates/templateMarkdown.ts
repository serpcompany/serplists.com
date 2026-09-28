import yaml from "js-yaml";
import {
  portableChecklistTemplateSchema,
  portableTemplatePackSchema,
  type PortableChecklistTemplate,
  type PortableTemplatePack,
} from "@/lib/schemas/checklistSchema";
import {
  escapeTemplateMarkdownDescription,
  parseTemplateMarkdownBody,
  renderTemplateMarkdownBlock,
} from "@/lib/templates/templateMarkdownBody";

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

const trimOptionalString = (value?: string) => {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed ? trimmed : undefined;
};

const normalizeStringArray = (values?: string[]) => {
  if (!Array.isArray(values)) return undefined;
  const normalized = values.map((value) => value.trim()).filter(Boolean);
  return normalized.length > 0 ? normalized : undefined;
};

const normalizeSubItems = (subItems?: { id?: string; title: string }[]) => {
  if (!Array.isArray(subItems) || subItems.length === 0) return undefined;
  return subItems.map((subItem) => ({
    title: subItem.title.trim(),
  }));
};

const normalizeContents = (contents?: PortableChecklistTemplate["sections"][number]["items"][number]["contents"]) => {
  if (!Array.isArray(contents) || contents.length === 0) return undefined;

  return contents.map((content) => {
    const nextContent: Record<string, unknown> = {
      type: content.type,
    };

    const normalizedValue = content.type === "subItems"
      ? ""
      : typeof content.value === "string"
        ? content.value.trim()
        : "";

    if (content.type !== "subItems" || normalizedValue) {
      nextContent.value = normalizedValue;
    }

    if (content.type === "image" || content.type === "video" || content.type === "file") {
      if (content.uploadType) nextContent.uploadType = content.uploadType;
      if (trimOptionalString(content.fileName)) nextContent.fileName = trimOptionalString(content.fileName);
      if (typeof content.fileSize === "number") nextContent.fileSize = content.fileSize;
    }

    if (content.type === "subItems") {
      const normalizedSubItems = normalizeSubItems(content.subItems);
      if (normalizedSubItems) nextContent.subItems = normalizedSubItems;
    }

    return nextContent;
  });
};

const normalizeSections = (sections: PortableChecklistTemplate["sections"]) =>
  sections.map((section) => ({
    title: section.title.trim(),
    items: section.items.map((item) => {
      const nextItem: Record<string, unknown> = {
        title: item.title.trim(),
      };

      const description = trimOptionalString(item.description);
      if (description) nextItem.description = description;

      const contents = normalizeContents(item.contents);
      if (contents) nextItem.contents = contents;

      return nextItem;
    }),
  }));

export const normalizePortableTemplate = (template: PortableChecklistTemplate): PortableChecklistTemplate => {
  const validated = portableChecklistTemplateSchema.parse(template);
  const normalizedTemplate: Record<string, unknown> = {
    title: validated.title.trim(),
    sections: normalizeSections(validated.sections),
  };

  const description = trimOptionalString(validated.description);
  if (description) normalizedTemplate.description = description;

  if (validated.type) normalizedTemplate.type = validated.type;
  if (trimOptionalString(validated.slug)) normalizedTemplate.slug = trimOptionalString(validated.slug);
  if (trimOptionalString(validated.seoTitle)) normalizedTemplate.seoTitle = trimOptionalString(validated.seoTitle);
  if (trimOptionalString(validated.seoDescription)) normalizedTemplate.seoDescription = trimOptionalString(validated.seoDescription);
  if (validated.visibility) normalizedTemplate.visibility = validated.visibility;
  if (normalizeStringArray(validated.categories)) normalizedTemplate.categories = normalizeStringArray(validated.categories);
  if (normalizeStringArray(validated.tags)) normalizedTemplate.tags = normalizeStringArray(validated.tags);
  if (Array.isArray(validated.rules) && validated.rules.length > 0) {
    normalizedTemplate.rules = validated.rules.map((rule) => ({
      type: rule.type.trim(),
      path: rule.path.trim(),
      severity: rule.severity ?? "error",
      ...(trimOptionalString(rule.id) ? { id: trimOptionalString(rule.id) } : {}),
      ...(typeof rule.value === "undefined" ? {} : { value: rule.value }),
    }));
  }

  return portableChecklistTemplateSchema.parse(normalizedTemplate);
};

export const normalizePortableTemplatePack = (pack: PortableTemplatePack): PortableTemplatePack => {
  const validated = portableTemplatePackSchema.parse(pack);

  return portableTemplatePackSchema.parse({
    ...validated,
    exportedBy: trimOptionalString(validated.exportedBy),
    templates: validated.templates.map((template) => normalizePortableTemplate(template)),
    manifest: validated.manifest
      ? {
          totalTemplates: validated.manifest.totalTemplates,
          ...(validated.manifest.format ? { format: validated.manifest.format } : {}),
          ...(typeof validated.manifest.includesVisibility === "boolean"
            ? { includesVisibility: validated.manifest.includesVisibility }
            : {}),
          ...(typeof validated.manifest.includesRules === "boolean"
            ? { includesRules: validated.manifest.includesRules }
            : {}),
          ...(typeof validated.manifest.assetWarnings === "number"
            ? { assetWarnings: validated.manifest.assetWarnings }
            : {}),
        }
      : undefined,
  });
};

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

const formatBytes = (value?: number) => {
  if (typeof value !== "number" || Number.isNaN(value) || value <= 0) return null;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1).replace(/\.0$/, "")} KB`;
  return `${(value / (1024 * 1024)).toFixed(1).replace(/\.0$/, "")} MB`;
};

const inferEmbedProvider = (url: string) => {
  const value = url.toLowerCase();
  if (value.includes("youtube.com") || value.includes("youtu.be")) return "YouTube";
  if (value.includes("vimeo.com")) return "Vimeo";
  if (value.includes("loom.com")) return "Loom";
  if (value.includes("figma.com")) return "Figma";
  if (value.includes("maps.google")) return "Google Maps";
  return "Embedded Content";
};

const escapeHtml = (value: string) =>
  value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");

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

const renderPreviewCard = (content: NonNullable<PortableChecklistTemplate["sections"][number]["items"][number]["contents"]>[number]) => {
  if (content.type === "text") {
    return `<div class="content-block text-block"><div class="card-label">Text</div><div class="text-markdown"><pre>${escapeHtml(content.value.trim())}</pre></div></div>`;
  }

  if (content.type === "subItems") {
    const items = (content.subItems ?? [])
      .map((subItem) => `<li><span class="checkbox" aria-hidden="true"></span><span>${escapeHtml(subItem.title)}</span></li>`)
      .join("");
    return `<div class="content-block card"><div class="card-label">Checklist</div><ul class="subitem-list">${items}</ul></div>`;
  }

  if (content.type === "image") {
    return `<div class="content-block card media-card"><div class="card-label">Image</div><img src="${escapeHtml(content.value)}" alt="${escapeHtml(content.fileName || "Template image")}" /><div class="card-meta"><a href="${escapeHtml(content.value)}">${escapeHtml(content.fileName || content.value)}</a></div></div>`;
  }

  if (content.type === "video") {
    return `<div class="content-block card media-card"><div class="card-label">Video</div><div class="media-placeholder">Video Preview</div><div class="card-meta"><a href="${escapeHtml(content.value)}">${escapeHtml(content.fileName || content.value)}</a></div></div>`;
  }

  if (content.type === "file") {
    return `<div class="content-block card file-card"><div class="card-label">File</div><div class="file-name">${escapeHtml(content.fileName || content.value)}</div><div class="card-meta"><a href="${escapeHtml(content.value)}">Open file</a>${content.fileSize ? ` <span>· ${escapeHtml(formatBytes(content.fileSize) || "")}</span>` : ""}</div></div>`;
  }

  return `<div class="content-block card embed-card"><div class="card-label">${escapeHtml(inferEmbedProvider(content.value))}</div><div class="embed-url"><a href="${escapeHtml(content.value)}">${escapeHtml(content.value)}</a></div></div>`;
};

export const renderTemplatePreviewHtml = (template: PortableChecklistTemplate) => {
  const normalized = normalizePortableTemplate(template);
  const sectionMarkup = normalized.sections
    .map((section) => {
      const itemsMarkup = section.items
        .map((item) => {
          const contentsMarkup = (item.contents ?? []).map((content) => renderPreviewCard(content)).join("");
          return `<article class="item-card"><div class="item-header"><span class="item-checkbox" aria-hidden="true"></span><div><h3>${escapeHtml(item.title)}</h3>${item.description ? `<p>${escapeHtml(item.description)}</p>` : ""}</div></div>${contentsMarkup ? `<div class="item-content">${contentsMarkup}</div>` : ""}</article>`;
        })
        .join("");
      return `<section class="section-card"><h2>${escapeHtml(section.title)}</h2>${itemsMarkup}</section>`;
    })
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(normalized.seoTitle || normalized.title)}</title>
    <style>
      :root {
        color-scheme: light;
        --bg: #f4f1ea;
        --surface: #fffdf8;
        --surface-strong: #f0ebe0;
        --ink: #1f1d1a;
        --muted: #6c655d;
        --line: #ddd2be;
        --accent: #b96b2f;
        --accent-soft: #f7e4d4;
        --shadow: 0 14px 30px rgba(71, 55, 34, 0.08);
      }
      * { box-sizing: border-box; }
      body {
        margin: 0;
        font-family: Georgia, "Times New Roman", serif;
        background: linear-gradient(180deg, #f8f5ee 0%, var(--bg) 100%);
        color: var(--ink);
      }
      main {
        max-width: 980px;
        margin: 0 auto;
        padding: 48px 20px 72px;
      }
      .hero, .section-card, .item-card, .card {
        background: var(--surface);
        border: 1px solid var(--line);
        box-shadow: var(--shadow);
      }
      .hero {
        border-radius: 28px;
        padding: 32px;
        margin-bottom: 24px;
      }
      .eyebrow {
        text-transform: uppercase;
        letter-spacing: 0.12em;
        font: 600 12px/1.2 Arial, sans-serif;
        color: var(--accent);
      }
      h1, h2, h3 { margin: 0; }
      h1 { font-size: clamp(2.2rem, 4vw, 3.6rem); margin-top: 10px; }
      .hero p, .item-header p, .meta-row { color: var(--muted); }
      .meta-row { margin-top: 14px; font: 500 14px/1.5 Arial, sans-serif; }
      .sections { display: grid; gap: 22px; }
      .section-card {
        border-radius: 24px;
        padding: 24px;
      }
      .section-card h2 {
        font-size: 1.55rem;
        margin-bottom: 18px;
      }
      .section-card h2::before {
        content: "";
        display: inline-block;
        width: 12px;
        height: 12px;
        margin-right: 10px;
        border-radius: 999px;
        background: var(--accent);
      }
      .item-card {
        border-radius: 20px;
        padding: 20px;
        margin-top: 16px;
      }
      .item-header {
        display: grid;
        grid-template-columns: 22px 1fr;
        gap: 14px;
        align-items: start;
      }
      .item-checkbox, .checkbox {
        width: 18px;
        height: 18px;
        border: 2px solid var(--accent);
        border-radius: 6px;
        display: inline-block;
        flex: 0 0 auto;
      }
      .item-content {
        display: grid;
        gap: 14px;
        margin-top: 16px;
      }
      .content-block.card {
        border-radius: 18px;
        padding: 16px;
      }
      .card-label {
        display: inline-flex;
        align-items: center;
        gap: 8px;
        font: 600 12px/1 Arial, sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.08em;
        color: var(--accent);
        background: var(--accent-soft);
        border-radius: 999px;
        padding: 7px 10px;
        margin-bottom: 12px;
      }
      .media-card img {
        width: 100%;
        max-height: 260px;
        object-fit: cover;
        border-radius: 14px;
        display: block;
        border: 1px solid var(--line);
      }
      .media-placeholder {
        border-radius: 14px;
        min-height: 160px;
        display: grid;
        place-items: center;
        background: var(--surface-strong);
        color: var(--muted);
        font: 600 14px/1 Arial, sans-serif;
        border: 1px dashed var(--line);
      }
      .card-meta, .embed-url, .file-name {
        font: 500 14px/1.5 Arial, sans-serif;
      }
      .card-meta, .embed-url { margin-top: 12px; color: var(--muted); }
      .subitem-list {
        list-style: none;
        padding: 0;
        margin: 0;
        display: grid;
        gap: 10px;
      }
      .subitem-list li {
        display: grid;
        grid-template-columns: 18px 1fr;
        gap: 10px;
        align-items: start;
      }
      .text-block pre {
        margin: 0;
        white-space: pre-wrap;
        font: 500 14px/1.6 "SFMono-Regular", Consolas, monospace;
        color: #2f2922;
        background: var(--surface-strong);
        border-radius: 14px;
        border: 1px solid var(--line);
        padding: 14px;
      }
      a { color: var(--accent); }
      @media (max-width: 720px) {
        main { padding: 20px 14px 40px; }
        .hero, .section-card, .item-card { padding: 18px; }
      }
    </style>
  </head>
  <body>
    <main>
      <header class="hero">
        <div class="eyebrow">${escapeHtml(normalized.type || "checklist")}</div>
        <h1>${escapeHtml(normalized.title)}</h1>
        ${normalized.description ? `<p>${escapeHtml(normalized.description)}</p>` : ""}
        ${(normalized.categories?.length || normalized.tags?.length)
          ? `<div class="meta-row">${[
              normalized.categories?.length ? `Categories: ${escapeHtml(normalized.categories.join(", "))}` : "",
              normalized.tags?.length ? `Tags: ${escapeHtml(normalized.tags.join(", "))}` : "",
            ].filter(Boolean).join(" · ")}</div>`
          : ""}
      </header>
      <div class="sections">
        ${sectionMarkup}
      </div>
    </main>
  </body>
</html>
`;
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

  const frontmatter = yaml.load(rawFrontmatter);
  if (!frontmatter || typeof frontmatter !== "object" || Array.isArray(frontmatter)) {
    throw new Error("Markdown template frontmatter must be a YAML object");
  }

  return {
    frontmatter: frontmatter as Record<string, unknown>,
    body,
  };
};

const parseYamlBlock = (rawBlock: string) => {
  const parsed = yaml.load(rawBlock.trim());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("Expected a YAML object block");
  }
  return parsed as Record<string, unknown>;
};

const parseSubItemsBlock = (rawBlock: string) => {
  const parsed = yaml.load(rawBlock.trim());
  if (!Array.isArray(parsed)) {
    throw new Error("Sub-items block must be a YAML array");
  }

  return parsed.map((entry) => {
    if (typeof entry === "string") return { title: entry.trim() };
    if (entry && typeof entry === "object" && typeof (entry as { title?: unknown }).title === "string") {
      return { title: (entry as { title: string }).title.trim() };
    }
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
            const parsedBlock = parseYamlBlock(block.body);
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
    sections,
  };

  return normalizePortableTemplate(portableChecklistTemplateSchema.parse(template));
};

export const parseTemplateYaml = (source: string): PortableChecklistTemplate | PortableTemplatePack => {
  const parsed = yaml.load(normalizeLineEndings(source));
  if (!parsed || typeof parsed !== "object") {
    throw new Error("YAML template source must be an object");
  }

  if ((parsed as { kind?: unknown }).kind === "serplists-template-pack") {
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
