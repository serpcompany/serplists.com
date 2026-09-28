import type { ChecklistTemplate } from "@/types/checklist";

// Client-side limits for importing a template file, checked before anything is sent.

export const MAX_TEMPLATES_PER_IMPORT = 5;
export const MAX_ASSET_BYTES = 5 * 1024 * 1024;
export const MAX_IMPORT_FILE_BYTES = 2 * 1024 * 1024; // 2MB
export const SUPPORTED_IMPORT_EXTENSIONS = [".json", ".md", ".markdown", ".yaml", ".yml"];

/** Image, video and file contents larger than MAX_ASSET_BYTES across `templates`. */
export const countOversizedAssets = (templates: ChecklistTemplate[]): number => {
  let count = 0;
  templates.forEach((template) => {
    template.sections.forEach((section) => {
      section.items.forEach((item) => {
        item.contents?.forEach((content) => {
          if (content.type !== "image" && content.type !== "video" && content.type !== "file") return;
          if (typeof content.fileSize === "number" && content.fileSize > MAX_ASSET_BYTES) {
            count += 1;
          }
        });
      });
    });
  });
  return count;
};
