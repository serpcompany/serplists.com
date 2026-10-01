import { describe, expect, it } from "vitest";
import { firstOf } from "../../../support/elements";

import {
  countOversizedTemplateAssets,
  TEMPLATE_IMPORT_MAX_ASSET_BYTES,
} from "@/lib/schemas/templateAssetLimits";
import { formatUploadLimit, TEMPLATE_UPLOAD_MAX_BYTES as UPLOAD_MAX_BYTES } from "@/lib/schemas/uploadLimits";
import { exportPortableTemplatesToJSON, parseTemplatesFromData } from "@/lib/utils/templateBackup";
import { validateFile } from "@/lib/utils/fileUpload";
import type { ChecklistTemplate } from "@/types/checklist";

const sectionsWithAsset = (fileSize: unknown, type = "file") => [
  {
    id: "section-1",
    title: "Docs",
    items: [
      {
        id: "item-1",
        title: "Read the brief",
        contents: [
          { id: "c1", type, value: "/api/uploads/file?key=x", fileName: "brief.pdf", fileSize, uploadType: "upload" },
        ],
      },
    ],
  },
];

describe("template asset limits", () => {
  it("never blocks on import an asset the uploader accepted, so an export always imports again", () => {
    expect(TEMPLATE_IMPORT_MAX_ASSET_BYTES).toBeGreaterThanOrEqual(UPLOAD_MAX_BYTES);

    const largestUpload = new File(["x"], "brief.pdf", { type: "application/pdf" });
    Object.defineProperty(largestUpload, "size", { value: UPLOAD_MAX_BYTES });
    expect(validateFile(largestUpload, "file").valid).toBe(true);
    expect(countOversizedTemplateAssets(sectionsWithAsset(UPLOAD_MAX_BYTES))).toBe(0);
    expect(countOversizedTemplateAssets(sectionsWithAsset(8 * 1024 * 1024, "video"))).toBe(0);
  });

  it("counts only asset sizes no upload could produce", () => {
    expect(countOversizedTemplateAssets(sectionsWithAsset(TEMPLATE_IMPORT_MAX_ASSET_BYTES + 1))).toBe(1);
    expect(countOversizedTemplateAssets("not sections")).toBe(0);
  });

  it("does not count a missing or invalid size, which is only a hint from the imported file", () => {
    expect(countOversizedTemplateAssets(sectionsWithAsset(undefined))).toBe(0);
    expect(countOversizedTemplateAssets(sectionsWithAsset("huge"))).toBe(0);
    expect(countOversizedTemplateAssets(sectionsWithAsset(Number.POSITIVE_INFINITY))).toBe(0);
  });

  it("never counts a text block", () => {
    expect(countOversizedTemplateAssets(sectionsWithAsset(TEMPLATE_IMPORT_MAX_ASSET_BYTES + 1, "text"))).toBe(0);
  });

  it("rejects an upload one byte over the limit", () => {
    const tooLarge = new File(["x"], "brief.pdf", { type: "application/pdf" });
    Object.defineProperty(tooLarge, "size", { value: UPLOAD_MAX_BYTES + 1 });

    expect(validateFile(tooLarge, "file")).toEqual({
      valid: false,
      error: `File size must be ${formatUploadLimit(UPLOAD_MAX_BYTES)} or less`,
    });
  });

  it("round-trips an exported template with the largest upload", () => {
    const template = {
      id: "template-1",
      title: "Onboarding",
      description: "",
      sections: sectionsWithAsset(UPLOAD_MAX_BYTES),
      isPublic: false,
      categories: [],
      tags: [],
    } as unknown as ChecklistTemplate;

    const pack = JSON.parse(JSON.stringify(exportPortableTemplatesToJSON([template])));
    const parsed = parseTemplatesFromData(pack);

    expect(parsed.templates).toHaveLength(1);
    expect(countOversizedTemplateAssets(firstOf(parsed.templates).sections)).toBe(0);
  });
});
