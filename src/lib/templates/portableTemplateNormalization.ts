import {
  portableChecklistTemplateSchema,
  portableTemplatePackSchema,
  type PortableChecklistTemplate,
  type PortableTemplatePack,
} from "@/lib/schemas/checklistSchema";

export const trimOptionalString = (value?: string) => {
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
