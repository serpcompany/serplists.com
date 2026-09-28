import type { PortableChecklistTemplate } from "./checklistSchema";

// The manifest of a portable pack, computed the same way by the API export and by the
// page when it adds public catalog templates to that export.

export type PortableSkippedTemplate = { title: string; reason: string };

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null;

/** Counts image, video, and file blocks that point at an upload, which a JSON pack cannot carry. */
export function countReferencedUploads(sections: unknown[]): number {
  let count = 0;

  for (const section of sections) {
    if (!isRecord(section) || !Array.isArray(section.items)) continue;
    for (const item of section.items) {
      if (!isRecord(item) || !Array.isArray(item.contents)) continue;
      for (const content of item.contents) {
        if (!isRecord(content)) continue;
        const type = content.type;
        const value = typeof content.value === "string" ? content.value : "";
        const isUpload = content.uploadType === "upload" || value.includes("/api/uploads/file") || value.includes("uploads/file?key=");
        if ((type === "image" || type === "video" || type === "file") && isUpload) {
          count += 1;
        }
      }
    }
  }

  return count;
}

/** The manifest for a pack holding `templates`; `skippedTemplates` lists those left out. */
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
