import type { UploadBucket } from "./uploadTypes";

export type { UploadBucket };

const MB = 1024 * 1024;

export const UPLOAD_MAX_BYTES: Record<UploadBucket, number> = {
  avatars: 5 * MB,
  "template-images": 50 * MB,
  "template-videos": 50 * MB,
  "template-files": 50 * MB,
};

export const TEMPLATE_UPLOAD_MAX_BYTES = Math.max(
  UPLOAD_MAX_BYTES["template-images"],
  UPLOAD_MAX_BYTES["template-videos"],
  UPLOAD_MAX_BYTES["template-files"],
);

export function formatUploadLimit(bytes: number): string {
  return `${Math.round(bytes / MB)}MB`;
}
