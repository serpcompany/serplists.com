import { isContentRecord, isSectionRecord, isTaskRecord } from "./jsonRecords";
import { formatUploadLimit, TEMPLATE_UPLOAD_MAX_BYTES } from "./uploadLimits";

export const TEMPLATE_IMPORT_MAX_ASSET_BYTES = TEMPLATE_UPLOAD_MAX_BYTES;

export const oversizedTemplateAssetMessage = (
  maxBytes: number = TEMPLATE_IMPORT_MAX_ASSET_BYTES,
): string => `Import blocked: one or more assets are over ${formatUploadLimit(maxBytes)}`;

const ASSET_CONTENT_TYPES = new Set(["image", "video", "file"]);

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

export const countOversizedTemplateAssets = (
  sections: unknown,
  maxBytes: number = TEMPLATE_IMPORT_MAX_ASSET_BYTES,
): number => {
  let count = 0;
  for (const section of asList(sections)) {
    for (const item of isSectionRecord(section) ? asList(section.items) : []) {
      for (const content of isTaskRecord(item) ? asList(item.contents) : []) {
        if (!isContentRecord(content) || !ASSET_CONTENT_TYPES.has(String(content.type))) continue;
        const { fileSize } = content;
        if (typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize > maxBytes) {
          count += 1;
        }
      }
    }
  }
  return count;
};
