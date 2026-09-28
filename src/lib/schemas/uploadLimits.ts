export type UploadBucket = "avatars" | "template-images" | "template-videos" | "template-files";

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

export function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}
