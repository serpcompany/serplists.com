import { optimizeImage, isImageFile } from "@/lib/imageOptimization";
import { api } from "@/lib/api";
import { formatAssetSizeLimit } from "@/lib/schemas/templateAssetLimits";
import {
  isAllowedUpload,
  UPLOAD_MAX_BYTES,
  unsupportedUploadMessage,
  uploadAcceptAttribute,
} from "@/lib/schemas/uploadTypes";

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
  userId: string
): Promise<UploadResult> => {
  try {
    let fileToUpload = file;

    // Only Image blocks are optimized. A file attached to a File block keeps its bytes.
    if (bucket === 'template-images' && isImageFile(file)) {
      try {
        fileToUpload = await optimizeImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.8
        });
      } catch (optimizationError) {
        console.warn('Image optimization failed, uploading original:', optimizationError);
        // Continue with original file if optimization fails
      }
    }

    // An image the browser could not convert (HEIC in most browsers) would be refused.
    if (!isAllowedUpload(bucket, fileToUpload)) {
      return { success: false, error: unsupportedUploadMessage(bucket) };
    }

    // API handles key naming; userId is kept for callsite compatibility.
    void userId;

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

export const getUploadedAssetKey = (url: string): string | null => {
  try {
    const parsed = new URL(url, 'https://serplists.local');
    const isUploadEndpoint =
      parsed.pathname === '/api/uploads/file' ||
      parsed.pathname === '/uploads/file';
    const key = parsed.searchParams.get('key')?.trim();

    return isUploadEndpoint && key ? key : null;
  } catch (error) {
    return null;
  }
};

export const isUploadedAssetUrl = (url: string): boolean =>
  getUploadedAssetKey(url) !== null;

// Only avatars can be deleted (the API refuses template uploads): a template
// upload may still be referenced by the saved template, its runs, versions, and
// copies, and uploads are not reference-counted.
export const deleteUploadedAsset = async (url: string): Promise<boolean> => {
  const key = getUploadedAssetKey(url);

  if (!key) {
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

// Checks a picked file against what the API stores (src/lib/schemas/uploadTypes.ts).
// Image blocks take any image: other decodable types are converted to PNG on upload.
export const validateFile = (
  file: File,
  type: 'image' | 'video' | 'file'
): { valid: boolean; error?: string } => {
  if (file.size > UPLOAD_MAX_BYTES) {
    return { valid: false, error: `File size must be ${formatAssetSizeLimit(UPLOAD_MAX_BYTES)} or less` };
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
