import type { PortableTemplateRule } from "@/lib/schemas/checklistSchema";
import type { PublicTemplateOwner, TemplateOwner } from "@/lib/schemas/templateOwner";
import type { TemplateUpdateResult } from "@/lib/templateUpdateResult";

export type ChecklistSubItem = {
  id?: string | undefined;
  title: string;
  isCompleted?: boolean | undefined;
};

export type ChecklistItemContent = {
  id?: string;
  type: "text" | "image" | "video" | "file" | "embed" | "subItems";
  value: string;
  uploadType?: "url" | "upload" | undefined;
  fileName?: string | undefined;
  fileSize?: number | undefined;
  subItems?: ChecklistSubItem[] | undefined;
};

export type ChecklistItem = {
  id: string;
  title: string;
  description?: string | undefined;
  contents?: ChecklistItemContent[] | undefined;
  isCompleted?: boolean | undefined;
  notes?: string;
};

export type ChecklistSection = {
  id: string;
  title: string;
  items: ChecklistItem[];
};

type TemplateRule = PortableTemplateRule;

export type ChecklistTemplate = {
  id: string;
  title: string;
  description?: string | undefined;
  type?: "checklist" | "recipe" | undefined;
  sections: ChecklistSection[];
  userId: string;
  createdAt: string;
  updatedAt: string;
  isPublic: boolean;
  slug?: string | undefined;
  seoTitle?: string | undefined;
  seoDescription?: string | undefined;
  seoUrl?: string | undefined;
  rules?: TemplateRule[] | undefined;
  categories?: string[];
  tags?: string[];
  version?: number | undefined;
  ownerProfile?: {
    full_name?: string | undefined;
    username?: string | undefined;
  } | undefined;
  teamId?: string | undefined;
  ownerType?: "user" | "team" | undefined;
  owner?: TemplateOwner | PublicTemplateOwner | undefined;
};

export type TemplateSavePayload = {
  id: string;
  title: string;
  description?: string;
  type?: "checklist" | "recipe";
  sections: ChecklistSection[];
  isPublic?: boolean | undefined;
  seoTitle?: string;
  seoDescription?: string;
  seoUrl?: string | undefined;
  rules?: TemplateRule[];
  categories?: string[];
  tags?: string[];
  slug?: string | undefined;
  version?: number;
};

export type RetiredRunSubTask = {
  id: string;
  title: string;
  isCompleted: boolean;
};

export type RetiredRunTask = RetiredRunSubTask & {
  notes?: string;
  subTasks: RetiredRunSubTask[];
};

export type RetiredRunItem =
  | { kind: "section"; id: string; title: string; tasks: RetiredRunTask[] }
  | { kind: "item"; id: string; sectionTitle?: string | undefined; task: RetiredRunTask }
  | { kind: "subItem"; id: string; itemTitle?: string | undefined; subTask: RetiredRunSubTask };

export type ChecklistRun = {
  id: string;
  templateId: string;
  title: string;
  status: "in_progress" | "completed";
  progress: number;
  sections: ChecklistSection[];
  startedAt: string;
  completedAt?: string | undefined;
  userId: string;
  templateVersion?: number;
  revision?: number | undefined;
  isStale?: boolean;
  isPublic?: boolean;
  teamId?: string | undefined;
  retiredItems?: RetiredRunItem[];
};

export type TemplateImportOptions = {
  visibility?: "preserve" | "public" | "private";
};

export type TemplateImportFailure = {
  index: number;
  title: string;
  reason: string;
  code: "invalid_fields" | "invalid_sections" | "oversized_asset" | "content_too_large" | "insert_failed";
};

type TemplateImportSuccess = {
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
  updateTemplate: (template: TemplateSavePayload) => Promise<TemplateUpdateResult>;
  deleteTemplate: (id: string) => Promise<void>;
  createRun: (params: { templateId: string; runName?: string | undefined; template?: ChecklistTemplate }) => Promise<ChecklistRun | null>;
  updateRun: (run: ChecklistRun, options?: { includeTitle?: boolean }) => Promise<ChecklistRun>;
  revalidateRun: (run: ChecklistRun) => Promise<void>;
  markRunShared?: (runId: string) => void;
  deleteRun: (id: string) => Promise<void>;
  importTemplates: (templates: ChecklistTemplate[], options?: TemplateImportOptions) => Promise<TemplateImportSummary>;
}
