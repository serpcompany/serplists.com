import { z } from "zod";

export const PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION = "2.0.0" as const;

// Base schema for checklist sub-items
export const checklistSubItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  isCompleted: z.boolean().optional()
});

// Schema for checklist item content
export const checklistItemContentSchema = z.object({
  id: z.string(),
  type: z.enum(["text", "image", "video", "file", "embed", "subItems"]),
  value: z.string(), // URL for image/video/file, embed code, markdown for text, or empty for subItems
  uploadType: z.enum(["url", "upload"]).optional(), // For image/video/file: whether it's a URL or uploaded file
  fileName: z.string().optional(), // Original filename for uploaded files
  fileSize: z.number().optional(), // File size in bytes for uploaded files
  subItems: z.array(checklistSubItemSchema).optional()
});

// Schema for individual checklist items
export const checklistItemSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  contents: z.array(checklistItemContentSchema).optional(),
  isCompleted: z.boolean().optional()
});

// Schema for checklist sections
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

// Schema for complete checklist templates
export const checklistTemplateSchema = z.object({
  id: z.string(),
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(["checklist", "recipe"]).optional(),
  sections: z.array(checklistSectionSchema),
  userId: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
  isPublic: z.boolean(),
  version: z.number().int().optional(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  rules: z.array(portableTemplateRuleSchema).optional(),
  categories: z.array(z.string()).optional(),
  tags: z.array(z.string()).optional()
});

// Lenient schema for imports (minimal fields, optional metadata)
export const checklistTemplateImportSchema = z.object({
  id: z.string().optional(),
  title: z.string(),
  description: z.string().optional(),
  type: z.enum(["checklist", "recipe"]).optional(),
  sections: z.union([z.array(z.unknown()), z.string()]).optional(),
  items: z.union([z.array(z.unknown()), z.string()]).optional(),
  userId: z.string().optional(),
  createdAt: z.string().optional(),
  updatedAt: z.string().optional(),
  isPublic: z.boolean().optional(),
  version: z.number().int().optional(),
  slug: z.string().optional(),
  seoTitle: z.string().optional(),
  seoDescription: z.string().optional(),
  rules: z.array(portableTemplateRuleSchema).optional(),
  categories: z.union([z.array(z.string()), z.string()]).optional(),
  category: z.string().optional(),
  tags: z.union([z.array(z.string()), z.string()]).optional()
});

// Schema for checklist runs
export const checklistRunSchema = z.object({
  id: z.string(),
  templateId: z.string(),
  title: z.string(),
  status: z.enum(["in_progress", "completed"]),
  progress: z.number(),
  sections: z.array(checklistSectionSchema),
  startedAt: z.string(),
  completedAt: z.string().optional(),
  userId: z.string()
});

// Schema for backup data (collection of templates)
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

export const portableChecklistSubItemSchema = z.object({
  id: z.string().optional(),
  title: z.string().min(1),
});

export const portableChecklistItemContentSchema = z.object({
  id: z.string().optional(),
  type: z.enum(["text", "image", "video", "file", "embed", "subItems"]),
  value: z.string().optional().default(""),
  uploadType: z.enum(["url", "upload"]).optional(),
  fileName: z.string().optional(),
  fileSize: z.number().optional(),
  subItems: z.array(portableChecklistSubItemSchema).optional(),
}).superRefine((content, ctx) => {
  if (content.type === "subItems") {
    if (!content.subItems || content.subItems.length === 0) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "subItems content requires at least one sub-item",
        path: ["subItems"],
      });
    }
    return;
  }

  if ((content.type === "image" || content.type === "video" || content.type === "file" || content.type === "embed") && !content.value.trim()) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      message: `${content.type} content requires a value`,
      path: ["value"],
    });
  }
});

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
});

export const portableTemplatePackEnvelopeSchema = z.object({
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
  }).optional(),
});

export const portableTemplatePackSchema = portableTemplatePackEnvelopeSchema.extend({
  schemaVersion: z.literal(PORTABLE_TEMPLATE_PACK_SCHEMA_VERSION),
});

// Type exports
export type ChecklistSubItem = z.infer<typeof checklistSubItemSchema>;
export type ChecklistItemContent = z.infer<typeof checklistItemContentSchema>;
export type ChecklistItem = z.infer<typeof checklistItemSchema>;
export type ChecklistSection = z.infer<typeof checklistSectionSchema>;
export type ChecklistTemplate = z.infer<typeof checklistTemplateSchema>;
export type ChecklistTemplateImport = z.infer<typeof checklistTemplateImportSchema>;
export type ChecklistRun = z.infer<typeof checklistRunSchema>;
export type TemplateBackup = z.infer<typeof templateBackupSchema>;
export type PortableTemplateRule = z.infer<typeof portableTemplateRuleSchema>;
export type PortableChecklistTemplate = z.infer<typeof portableChecklistTemplateSchema>;
export type PortableTemplatePackEnvelope = z.infer<typeof portableTemplatePackEnvelopeSchema>;
export type PortableTemplatePack = z.infer<typeof portableTemplatePackSchema>;

// Validation functions
export const validateTemplate = (data: unknown): ChecklistTemplate => {
  return checklistTemplateSchema.parse(data);
};

export const validateBackup = (data: unknown): TemplateBackup => {
  return templateBackupSchema.parse(data);
};

export const validateTemplateArray = (data: unknown): ChecklistTemplate[] => {
  return z.array(checklistTemplateSchema).parse(data);
};

export const validateTemplateImportArray = (data: unknown): ChecklistTemplateImport[] => {
  return z.array(checklistTemplateImportSchema).parse(data);
};

export const validatePortableTemplatePackEnvelope = (data: unknown): PortableTemplatePackEnvelope => {
  return portableTemplatePackEnvelopeSchema.parse(data);
};

export const validatePortableTemplatePack = (data: unknown): PortableTemplatePack => {
  return portableTemplatePackSchema.parse(data);
};
