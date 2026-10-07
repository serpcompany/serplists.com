import {
  portableChecklistTemplateSchema,
  portableTemplatePackSchema,
  type PortableChecklistTemplate,
  type PortableTemplatePack,
  type PortableTemplateRule,
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

const normalizeSubItems = (subItems?: { title: string }[]) => {
  if (!Array.isArray(subItems) || subItems.length === 0) return undefined;
  return subItems.map((subItem) => ({
    title: subItem.title.trim(),
  }));
};

type PortableContent = NonNullable<PortableChecklistTemplate["sections"][number]["items"][number]["contents"]>[number];
type PortableFormField = Extract<PortableContent, { type: "form" }>["fields"][number];

type NormalizedFormField = {
  label: string;
  kind: PortableFormField["kind"];
  required: boolean;
  description?: string;
  options?: { label: string }[];
  min?: number;
  max?: number;
};

type NormalizedContent = {
  type: PortableContent["type"];
  value?: string;
  uploadType?: NonNullable<PortableContent["uploadType"]>;
  fileName?: string;
  fileSize?: number;
  subItems?: { title: string }[];
  fields?: NormalizedFormField[];
};

type NormalizedItem = { title: string; description?: string; contents?: NormalizedContent[] };

type NormalizedRule = Omit<PortableTemplateRule, "id"> & { id?: string | undefined };

type NormalizedTemplate = {
  title: string;
  sections: { title: string; items: NormalizedItem[] }[];
  description?: string;
  type?: NonNullable<PortableChecklistTemplate["type"]>;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  visibility?: NonNullable<PortableChecklistTemplate["visibility"]>;
  categories?: string[];
  tags?: string[];
  rules?: NormalizedRule[];
  requiredTools?: NonNullable<PortableChecklistTemplate["requiredTools"]>;
};

const normalizeFormField = (field: PortableFormField): NormalizedFormField => {
  const next: NormalizedFormField = { label: field.label.trim(), kind: field.kind, required: field.required ?? false };
  const description = trimOptionalString(field.description);
  if (description) next.description = description;
  if (field.kind === "select" || field.kind === "multiSelect") {
    next.options = field.options.map((option) => ({ label: option.label.trim() }));
  }
  if (field.kind === "number" && typeof field.min === "number") next.min = field.min;
  if (field.kind === "number" && typeof field.max === "number") next.max = field.max;
  return next;
};

const holdsNoValue = (type: PortableContent["type"]) => type === "subItems" || type === "form";

const normalizeContents = (contents?: PortableContent[]) => {
  if (!Array.isArray(contents) || contents.length === 0) return undefined;

  return contents.map((content) => {
    const nextContent: NormalizedContent = {
      type: content.type,
    };

    const normalizedValue = holdsNoValue(content.type)
      ? ""
      : typeof content.value === "string"
        ? content.value.trim()
        : "";

    if (!holdsNoValue(content.type)) {
      nextContent.value = normalizedValue;
    }

    if (content.type === "image" || content.type === "video" || content.type === "file") {
      if (content.uploadType) nextContent.uploadType = content.uploadType;
      const fileName = trimOptionalString(content.fileName);
      if (fileName) nextContent.fileName = fileName;
      if (typeof content.fileSize === "number") nextContent.fileSize = content.fileSize;
    }

    if (content.type === "subItems") {
      const normalizedSubItems = normalizeSubItems(content.subItems);
      if (normalizedSubItems) nextContent.subItems = normalizedSubItems;
    }

    if (content.type === "form") nextContent.fields = content.fields.map(normalizeFormField);

    return nextContent;
  });
};

const normalizeSections = (sections: PortableChecklistTemplate["sections"]) =>
  sections.map((section) => ({
    title: section.title.trim(),
    items: section.items.map((item) => {
      const nextItem: NormalizedItem = {
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
  const normalizedTemplate: NormalizedTemplate = {
    title: validated.title.trim(),
    sections: normalizeSections(validated.sections),
  };

  const description = trimOptionalString(validated.description);
  if (description) normalizedTemplate.description = description;

  if (validated.type) normalizedTemplate.type = validated.type;
  const slug = trimOptionalString(validated.slug);
  if (slug) normalizedTemplate.slug = slug;
  const seoTitle = trimOptionalString(validated.seoTitle);
  if (seoTitle) normalizedTemplate.seoTitle = seoTitle;
  const seoDescription = trimOptionalString(validated.seoDescription);
  if (seoDescription) normalizedTemplate.seoDescription = seoDescription;
  if (validated.visibility) normalizedTemplate.visibility = validated.visibility;
  const categories = normalizeStringArray(validated.categories);
  if (categories) normalizedTemplate.categories = categories;
  const tags = normalizeStringArray(validated.tags);
  if (tags) normalizedTemplate.tags = tags;
  if (Array.isArray(validated.rules) && validated.rules.length > 0) {
    normalizedTemplate.rules = validated.rules.map((rule) => ({
      type: rule.type.trim(),
      path: rule.path.trim(),
      severity: rule.severity ?? "error",
      ...(trimOptionalString(rule.id) ? { id: trimOptionalString(rule.id) } : {}),
      ...(typeof rule.value === "undefined" ? {} : { value: rule.value }),
    }));
  }

  if (Array.isArray(validated.requiredTools) && validated.requiredTools.length > 0) {
    normalizedTemplate.requiredTools = validated.requiredTools.map((tool) => ({
      name: tool.name.trim(),
      url: tool.url,
      required: tool.required,
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
