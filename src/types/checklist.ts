// Centralized type definitions for checklist functionality
import type { PortableTemplateRule } from "@/lib/schemas/checklistSchema";

export type ChecklistSubItem = {
  id: string;
  title: string;
  isCompleted?: boolean;
};

export type ChecklistItemContent = {
  id?: string; // Assigned by the template editor; imported, repo, and legacy content may not have one
  type: "text" | "image" | "video" | "file" | "embed" | "subItems";
  value: string; // URL for image/video/file, embed code, markdown for text, or empty for subItems
  uploadType?: "url" | "upload"; // For image/video/file: whether it's a URL or uploaded file
  fileName?: string; // Original filename for uploaded files
  fileSize?: number; // File size in bytes for uploaded files
  subItems?: ChecklistSubItem[]; // Only used when type is "subItems"
};

export type ChecklistItem = {
  id: string;
  title: string;
  description?: string;
  contents?: ChecklistItemContent[];
  isCompleted?: boolean;
  notes?: string;
};

export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

// Rules are always parsed with portableTemplateRuleSchema (API responses, imports, repo packs),
// so `severity` has its default applied.
export type TemplateRule = PortableTemplateRule;

export type ChecklistTemplate = {
  id: string;
  title: string;
  description?: string;
  type?: "checklist" | "recipe";
  sections: ChecklistSection[];
  userId: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string;
  rules?: TemplateRule[];
  categories?: string[];
  tags?: string[];
  version?: number;
  ownerProfile?: {
    full_name?: string;
    username?: string;
  };
  teamId?: string;
};

export type TemplateSavePayload = {
  id: string;
  title: string;
  description?: string;
  type?: "checklist" | "recipe";
  sections: ChecklistSection[];
  isPublic: boolean;
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string;
  rules?: TemplateRule[];
  categories?: string[];
  tags?: string[];
  slug?: string;
  version?: number;
};

export type ChecklistRun = {
  id: string;
  templateId: string;
  title: string;
  status: "in_progress" | "completed";
  progress: number;
  sections: ChecklistSection[];
  startedAt: string;
  completedAt?: string;
  userId: string;
  templateVersion?: number;
  revision?: number;
  isStale?: boolean;
  isPublic?: boolean;
  teamId?: string;
};

export type TemplateImportOptions = {
  visibility?: "preserve" | "public" | "private";
};

export type TemplateExportFormat = "backup" | "portable";

export type TemplateImportFailure = {
  index: number;
  title: string;
  reason: string;
  code: "invalid_fields" | "invalid_sections" | "oversized_asset" | "insert_failed";
};

export type TemplateImportSuccess = {
  index: number;
  title: string;
  id: string;
  slug: string;
  visibility: "public" | "private";
};

export type TemplateImportSummary = {
  total: number;
  imported: number;
  failed: TemplateImportFailure[];
  successes: TemplateImportSuccess[];
};

export interface TemplatesContextProps {
  templates: ChecklistTemplate[];
  allTemplates: ChecklistTemplate[];
  templatesLoading?: boolean;
  runs: ChecklistRun[];
  runsLoading?: boolean;
  getTemplate: (id: string) => ChecklistTemplate | undefined;
  getTemplateBySlug: (slug: string) => ChecklistTemplate | undefined;
  getRun: (id: string) => ChecklistRun | undefined;
  getRunsForTemplate: (templateId: string) => ChecklistRun[];
  getAllPublicTemplates: () => ChecklistTemplate[];
  createTemplate: (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "slug">) => Promise<ChecklistTemplate>;
  updateTemplate: (template: TemplateSavePayload) => Promise<void>;
  deleteTemplate: (id: string) => Promise<void>;
  createRun: (params: { templateId: string; runName?: string; template?: ChecklistTemplate }) => Promise<ChecklistRun | null>;
  updateRun: (run: ChecklistRun) => Promise<ChecklistRun>;
  revalidateRun: (run: ChecklistRun) => Promise<void>;
  deleteRun: (id: string) => Promise<void>;
  importTemplates: (templates: ChecklistTemplate[], options?: TemplateImportOptions) => Promise<TemplateImportSummary>;
}
