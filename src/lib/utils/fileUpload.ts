import { optimizeImage, isImageFile } from "@/lib/imageOptimization";
import { api } from "@/lib/api";
import { formatAssetSizeLimit } from "@/lib/schemas/templateAssetLimits";
import { getUploadedAssetKey, isUploadedAssetUrl } from "@/lib/utils/mediaSource";
import {
  isAllowedUpload,
  unsupportedUploadMessage,
  uploadAcceptAttribute,
} from "@/lib/schemas/uploadTypes";
import { UPLOAD_MAX_BYTES } from "@/lib/schemas/uploadLimits";

export type TemplateUploadBucket =
  | 'template-images'
  | 'template-videos'
  | 'template-files';

export type UploadedAssetBucket = TemplateUploadBucket | 'avatars';

export type UploadResult = {
  success: boolean;
  url?: string;
  error?: string;
  fileName?: string;
  fileSize?: number;
};

export const uploadFile = async (
  file: File,
  bucket: TemplateUploadBucket,
): Promise<UploadResult> => {
  try {
    let fileToUpload = file;

    if (bucket === 'template-images' && isImageFile(file)) {
      try {
        fileToUpload = await optimizeImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.8
        });
      } catch (optimizationError) {
        console.warn('Image optimization failed, uploading original:', optimizationError);
      }
    }

    if (!isAllowedUpload(bucket, fileToUpload)) {
      return { success: false, error: unsupportedUploadMessage(bucket) };
    }

    const result = await api.uploadToR2({ bucket, file: fileToUpload });

    return {
      success: true,
      url: result.url,
      fileName: result.fileName || fileToUpload.name,
      fileSize: result.fileSize || fileToUpload.size,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    };
  }
};

export { getUploadedAssetKey, isUploadedAssetUrl };

export const uploadAvatar = (file: File) => api.uploadToR2({ bucket: 'avatars', file });

export const deleteUploadedAsset = async (url: string): Promise<boolean> => {
  const key = getUploadedAssetKey(url);

  if (!key?.startsWith('avatars/')) {
    return false;
  }

  try {
    await api.deleteFromR2(key);
    return true;
  } catch (error) {
    console.error('Delete error:', error);
    return false;
  }
};

const BUCKET_BY_BLOCK_TYPE = {
  image: 'template-images',
  video: 'template-videos',
  file: 'template-files',
} as const satisfies Record<'image' | 'video' | 'file', TemplateUploadBucket>;

export const validateFile = (
  file: File,
  type: 'image' | 'video' | 'file'
): { valid: boolean; error?: string } => {
  const maxSize = UPLOAD_MAX_BYTES[BUCKET_BY_BLOCK_TYPE[type]];
  if (file.size > maxSize) {
    return { valid: false, error: `File size must be ${formatAssetSizeLimit(maxSize)} or less` };
  }

  if (type === 'image') {
    return file.type.startsWith('image/')
      ? { valid: true }
      : { valid: false, error: 'Please select an image file' };
  }

  const bucket = BUCKET_BY_BLOCK_TYPE[type];
  return isAllowedUpload(bucket, file)
    ? { valid: true }
    : { valid: false, error: unsupportedUploadMessage(bucket) };
};

export const uploadAcceptTypesForBlock = (type: 'image' | 'video' | 'file'): string =>
  type === 'image' ? 'image/*' : uploadAcceptAttribute(BUCKET_BY_BLOCK_TYPE[type]);
