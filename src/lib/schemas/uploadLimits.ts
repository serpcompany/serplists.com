import type { UploadBucket } from "./uploadTypes";

export type { UploadBucket };

const MB = 1024 * 1024;

/**
 * The largest file each upload bucket accepts. POST /api/uploads enforces
 * these; the upload forms check the same numbers first, so the two cannot
 * drift.
 */
export const UPLOAD_MAX_BYTES: Record<UploadBucket, number> = {
  avatars: 5 * MB,
  "template-images": 50 * MB,
  "template-videos": 50 * MB,
  "template-files": 50 * MB,
};

/** The largest file any Template upload bucket accepts (images, videos, files). */
export const TEMPLATE_UPLOAD_MAX_BYTES = Math.max(
  UPLOAD_MAX_BYTES["template-images"],
  UPLOAD_MAX_BYTES["template-videos"],
  UPLOAD_MAX_BYTES["template-files"],
);

export function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}
