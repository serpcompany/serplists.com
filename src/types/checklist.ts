// Centralized type definitions for checklist functionality
export type ChecklistSubItem = {
  id: string;
  title: string;
  isCompleted?: boolean;
};

export type ChecklistItemContent = {
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
};

export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

export type TemplateRule = {
  id: string;
  type: string;
  path: string;
  value?: unknown;
  severity?: "error" | "warning";
};

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
};

export type TemplateImportOptions = {
  visibility?: "preserve" | "public" | "private";
};

export type TemplateExportFormat = "backup" | "portable";

export type TemplateImportSummary = {
  imported: number;
  failed: { title: string; reason: string }[];
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
  updateTemplate: (template: ChecklistTemplate) => void;
  deleteTemplate: (id: string) => void;
  createRun: (params: { templateId: string; runName?: string }) => Promise<ChecklistRun | null>;
  updateRun: (run: ChecklistRun) => void;
  deleteRun: (id: string) => void;
  importTemplates: (templates: ChecklistTemplate[], options?: TemplateImportOptions) => Promise<TemplateImportSummary>;
}
