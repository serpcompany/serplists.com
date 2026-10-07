import { z } from "zod";

import { portableRequiredToolSchema } from "./requiredTools";
import {
  FORM_FIELD_KINDS,
  MAX_FORM_DESCRIPTION_LENGTH,
  MAX_FORM_FIELD_OPTIONS,
  MAX_FORM_FIELDS,
  MAX_FORM_LABEL_LENGTH,
} from "./formFields";
import { CHECKLIST_CONTENT_TYPES } from "./storedSections";

export const PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION = "2.1.0" as const;
const PORTABLE_TEMPLATE_PACK_IMPORTABLE_SCHEMA_VERSIONS = ["2.0.0", PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION] as const;

export const checklistSubItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  isCompleted: z.boolean().optional()
});

const checklistFormFieldSchema = z.object({
  id: z.string(),
  label: z.string(),
  kind: z.enum(FORM_FIELD_KINDS),
  required: z.boolean(),
  description: z.string().optional(),
  options: z.array(z.object({ id: z.string(), label: z.string() })).optional(),
  min: z.number().optional(),
  max: z.number().optional(),
});

export const checklistItemContentSchema = z.object({
  id: z.string(),
  type: z.enum(CHECKLIST_CONTENT_TYPES),
  value: z.string(),
  uploadType: z.enum(["url", "upload"]).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  subItems: z.array(checklistSubItemSchema).optional(),
  fields: z.array(checklistFormFieldSchema).optional()
});

export const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contents: z.array(checklistItemContentSchema).optional(),
  isCompleted: z.boolean().optional()
});

export const checklistSectionSchema = z.object({
  id: z.string(),
  title: z.string(),
  items: z.array(checklistItemSchema)
});

export const portableTemplateRuleSchema = z.object({
  id: z.string(),
  type: z.string(),
  path: z.string(),
  value: z.unknown().optional(),
  severity: z.enum(["error", "warning"]).default("error"),
});

const templateDescriptionFields = {
  description: z.string().optional(),
  type: z.enum(["checklist", "recipe"]).optional(),
};

const templatePublishingFields = {
  version: z.number().int().optional(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  rules: z.array(portableTemplateRuleSchema).optional(),
  requiredTools: z.array(portableRequiredToolSchema).optional(),
};

export const checklistTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  ...templateDescriptionFields,
  sections: z.array(checklistSectionSchema),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  ...templatePublishingFields,
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

const checklistTemplateImportSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  ...templateDescriptionFields,
  sections: z.union([z.array(z.unknown()), z.string()]).optional(),
  items: z.union([z.array(z.unknown()), z.string()]).optional(),
  userId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  isPublic: z.boolean().optional(),
  ...templatePublishingFields,
  categories: z.union([z.array(z.string()), z.string()]).optional(),
  category: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional()
});

export const templateBackupSchema = z.object({
  version: z.string(),
  exportedAt: z.string(),
  exportedBy: z.string().optional(),
  templates: z.array(checklistTemplateSchema),
  metadata: z.object({
    totalTemplates: z.number(),
    publicTemplates: z.number(),
    privateTemplates: z.number()
  }).optional()
});

const portableChecklistSubItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
});

const portableContentShape = <T extends string, V extends z.ZodTypeAny, S extends z.ZodTypeAny>(
  type: T,
  value: V,
  subItems: S,
) =>
  z.object({
    id: z.string().optional(),
    type: z.literal(type),
    value,
    uploadType: z.enum(["url", "upload"]).optional(),
    fileName: z.string().optional(),
    fileSize: z.number().optional(),
    subItems,
  });

const optionalContentValue = z.string().optional().default("");
const optionalSubItems = z.array(portableChecklistSubItemSchema).optional();

const nonBlankContentValue = (type: string) => {
  const message = `${type} content requires a value`;
  return z.string({ required_error: message }).regex(/\S/, message);
};

const subItemsRequiredMessage = "subItems content requires at least one sub-item";

const formLabel = (what: string) => {
  const blank = `${what} needs a label`;
  return z
    .string({ required_error: blank })
    .max(MAX_FORM_LABEL_LENGTH, `${what} label must be ${MAX_FORM_LABEL_LENGTH} characters or fewer`)
    .regex(/\S/, blank);
};

const portableFormOptionSchema = z.object({
  id: z.string().optional(),
  label: formLabel("Each option"),
});

const portableFormFieldBase = {
  id: z.string().optional(),
  label: formLabel("Each form field"),
  required: z.boolean().optional(),
  description: z
    .string()
    .max(MAX_FORM_DESCRIPTION_LENGTH, `Form field help text must be ${MAX_FORM_DESCRIPTION_LENGTH} characters or fewer`)
    .optional(),
};

const portableFormField = <Kind extends (typeof FORM_FIELD_KINDS)[number]>(kind: Kind) =>
  z.object({ ...portableFormFieldBase, kind: z.literal(kind) });

const optionsRequiredMessage = "Dropdown and multiple choice fields need at least one option";

const portableChoiceFormField = <Kind extends "select" | "multiSelect">(kind: Kind) =>
  portableFormField(kind).extend({
    options: z
      .array(portableFormOptionSchema, { required_error: optionsRequiredMessage })
      .min(1, optionsRequiredMessage)
      .max(MAX_FORM_FIELD_OPTIONS, `A field can have ${MAX_FORM_FIELD_OPTIONS} options or fewer`),
  });

const portableFormFieldSchema = z.discriminatedUnion("kind", [
  portableFormField("text"),
  portableFormField("longText"),
  portableFormField("url"),
  portableFormField("email"),
  portableFormField("number").extend({ min: z.number().optional(), max: z.number().optional() }),
  portableFormField("date"),
  portableChoiceFormField("select"),
  portableChoiceFormField("multiSelect"),
  portableFormField("checkbox"),
  portableFormField("file"),
]);

const formFieldsRequiredMessage = "form content requires at least one field";

export const portableChecklistItemContentSchema = z.discriminatedUnion("type", [
  portableContentShape("text", optionalContentValue, optionalSubItems),
  portableContentShape("image", nonBlankContentValue("image"), optionalSubItems),
  portableContentShape("video", nonBlankContentValue("video"), optionalSubItems),
  portableContentShape("file", nonBlankContentValue("file"), optionalSubItems),
  portableContentShape("embed", nonBlankContentValue("embed"), optionalSubItems),
  portableContentShape(
    "subItems",
    optionalContentValue,
    z
      .array(portableChecklistSubItemSchema, { required_error: subItemsRequiredMessage })
      .min(1, subItemsRequiredMessage),
  ),
  portableContentShape("form", optionalContentValue, optionalSubItems).extend({
    fields: z
      .array(portableFormFieldSchema, { required_error: formFieldsRequiredMessage })
      .min(1, formFieldsRequiredMessage)
      .max(MAX_FORM_FIELDS, `A form can have ${MAX_FORM_FIELDS} fields or fewer`),
  }),
]);

export const portableChecklistItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  description: z.string().optional(),
  contents: z.array(portableChecklistItemContentSchema).optional(),
});

export const portableChecklistSectionSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
  items: z.array(portableChecklistItemSchema).min(1),
});

export const portableChecklistTemplateSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
  type: z.enum(["checklist", "recipe"]).optional(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  visibility: z.enum(["public", "private"]).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional(),
  sections: z.array(portableChecklistSectionSchema).min(1),
  rules: z.array(portableTemplateRuleSchema).optional(),
  requiredTools: z.array(portableRequiredToolSchema).optional(),
});

const portableTemplatePackEnvelopeSchema = z.object({
  kind: z.literal("serplists-template-pack"),
  schemaVersion: z.string(),
  exportedAt: z.string(),
  exportedBy: z.string().optional(),
  templates: z.array(portableChecklistTemplateSchema),
  manifest: z.object({
    totalTemplates: z.number().int().nonnegative(),
    format: z.literal("portable").optional(),
    includesVisibility: z.boolean().optional(),
    includesRules: z.boolean().optional(),
    assetWarnings: z.number().int().nonnegative().optional(),
    skippedTemplates: z.array(z.object({ title: z.string(), reason: z.string() })).optional(),
  }).optional(),
});

export const portableTemplatePackSchema = portableTemplatePackEnvelopeSchema.extend({
  schemaVersion: z.enum(PORTABLE_TEMPLATE_PACK_IMPORTABLE_SCHEMA_VERSIONS),
});

export const isImportablePortableSchemaVersion = (version: string): boolean =>
  PORTABLE_TEMPLATE_PACK_IMPORTABLE_SCHEMA_VERSIONS.some((importable) => importable === version);

export const portableTemplatePackLooseEnvelopeSchema = portableTemplatePackEnvelopeSchema.extend({
  templates: z.array(z.unknown()),
});

export type ChecklistTemplateImport = z.infer<typeof checklistTemplateImportSchema>;
export type TemplateBackup = z.infer<typeof templateBackupSchema>;
export type PortableTemplateRule = z.infer<typeof portableTemplateRuleSchema>;
export type PortableChecklistTemplate = z.infer<typeof portableChecklistTemplateSchema>;
export type PortableTemplatePackLooseEnvelope = z.infer<typeof portableTemplatePackLooseEnvelopeSchema>;
export type PortableTemplatePack = z.infer<typeof portableTemplatePackSchema>;

export const validateBackup = (data: unknown): TemplateBackup => {
  return templateBackupSchema.parse(data);
};

export const validateTemplateImportArray = (data: unknown): ChecklistTemplateImport[] => {
  return z.array(checklistTemplateImportSchema).parse(data);
};

export const validatePortableTemplatePackEnvelope = (data: unknown): PortableTemplatePackLooseEnvelope => {
  return portableTemplatePackLooseEnvelopeSchema.parse(data);
};
