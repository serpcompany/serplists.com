// Centralized type definitions for checklist functionality
export type ChecklistSubItem = {
  id: string;
  title: string;
  isCompleted?: boolean;
};

export type ChecklistItemContent = {
  type: "text" | "image" | "video" | "file" | "embed" | "subItems" | "page";
  value: string; // URL for image/video/file, embed code, markdown for text, page ID for pages, or empty for subItems
  uploadType?: "url" | "upload"; // For image/video/file: whether it's a URL or uploaded file
  fileName?: string; // Original filename for uploaded files
  fileSize?: number; // File size in bytes for uploaded files
  subItems?: ChecklistSubItem[]; // Only used when type is "subItems"
  pageId?: string; // Only used when type is "page"
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

export type ChecklistTemplate = {
  id: string;
  title: string;
  description?: string;
  sections: ChecklistSection[];
  userId: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  slug?: string;
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string;
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

export interface TemplatesContextProps {
  templates: ChecklistTemplate[];
  allTemplates: ChecklistTemplate[];
  runs: ChecklistRun[];
  getTemplate: (id: string) => ChecklistTemplate | undefined;
  getTemplateBySlug: (slug: string) => ChecklistTemplate | undefined;
  getRun: (id: string) => ChecklistRun | undefined;
  getRunsForTemplate: (templateId: string) => ChecklistRun[];
  getAllPublicTemplates: () => ChecklistTemplate[];
  createTemplate: (templateData: Omit<ChecklistTemplate, "id" | "userId" | "createdAt" | "updatedAt" | "isPublic" | "slug">) => Promise<ChecklistTemplate>;
  updateTemplate: (template: ChecklistTemplate) => void;
  deleteTemplate: (id: string) => void;
  createRun: (params: { templateId: string; runName?: string }) => Promise<ChecklistRun | null>;
  updateRun: (run: ChecklistRun) => void;
  deleteRun: (id: string) => void;
  hideTemplate: (templateId: string) => void;
  importTemplates: (templates: ChecklistTemplate[]) => Promise<void>;
}