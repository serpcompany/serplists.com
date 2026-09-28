import { TEMPLATE_UPLOAD_MAX_BYTES } from "./uploadLimits";

// One asset size limit for template uploads and imports, shared by the app and the API.
// A template exported from the app must import again, so import accepts every size the
// uploader accepts. Import copies only asset URLs, never bytes, so the import check
// only rejects sizes no upload could have produced. The size is read from the imported
// file: it is a hint, never a guarantee, and a missing or invalid one is ignored.
export const TEMPLATE_IMPORT_MAX_ASSET_BYTES = TEMPLATE_UPLOAD_MAX_BYTES;

// "50MB": build every size message from the limit, never from a literal.
export const formatAssetSizeLimit = (bytes: number): string =>
  `${Math.floor(bytes / (1024 * 1024))}MB`;

export const oversizedTemplateAssetMessage = (
  maxBytes: number = TEMPLATE_IMPORT_MAX_ASSET_BYTES,
): string => `Import blocked: one or more assets are over ${formatAssetSizeLimit(maxBytes)}`;

const ASSET_CONTENT_TYPES = new Set(["image", "video", "file"]);

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);

const asList = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

// Image, video, and file blocks whose recorded size is over the limit.
export const countOversizedTemplateAssets = (
  sections: unknown,
  maxBytes: number = TEMPLATE_IMPORT_MAX_ASSET_BYTES,
): number => {
  let count = 0;
  for (const section of asList(sections)) {
    for (const item of isRecord(section) ? asList(section.items) : []) {
      for (const content of isRecord(item) ? asList(item.contents) : []) {
        if (!isRecord(content) || !ASSET_CONTENT_TYPES.has(String(content.type))) continue;
        const { fileSize } = content;
        if (typeof fileSize === "number" && Number.isFinite(fileSize) && fileSize > maxBytes) {
          count += 1;
        }
      }
    }
  }
  return count;
};
