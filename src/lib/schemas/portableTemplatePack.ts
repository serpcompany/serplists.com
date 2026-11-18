import type { PortableChecklistTemplate } from "./checklistSchema";

export type PortableSkippedTemplate = { title: string; reason: string };

type AssetContent = { type: string; value: string; uploadType?: "url" | "upload" | undefined };

export const isUploadedAsset = (content: AssetContent): boolean =>
  (content.type === "image" || content.type === "video" || content.type === "file") &&
  (content.uploadType === "upload" || content.value.includes("/api/uploads/file") || content.value.includes("uploads/file?key="));

const countReferencedUploads = (sections: PortableChecklistTemplate["sections"]): number =>
  sections.flatMap((section) => section.items).flatMap((item) => item.contents ?? []).filter(isUploadedAsset).length;

export function buildPortablePackManifest(templates: PortableChecklistTemplate[], skippedTemplates: PortableSkippedTemplate[]) {
  return {
    totalTemplates: templates.length,
    format: "portable" as const,
    includesVisibility: templates.length > 0,
    includesRules: templates.some((template) => Array.isArray(template.rules) && template.rules.length > 0),
    assetWarnings: templates.reduce((total, template) => total + countReferencedUploads(template.sections), 0),
    ...(skippedTemplates.length > 0 ? { skippedTemplates } : {}),
  };
}
