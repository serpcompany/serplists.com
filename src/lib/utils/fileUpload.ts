import { optimizeImage, isImageFile } from "@/lib/imageOptimization";
import { api } from "@/lib/api";
import { UPLOAD_MAX_BYTES, formatUploadLimit } from "@/lib/schemas/uploadLimits";

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
    
    // Optimize images before upload
    if (isImageFile(file)) {
      try {
        fileToUpload = await optimizeImage(file, {
          maxWidth: 1920,
          maxHeight: 1080,
          quality: 0.8
        });
        console.log('Image optimized:', { 
          original: file.size, 
          optimized: fileToUpload.size, 
          savings: Math.round((1 - fileToUpload.size / file.size) * 100) + '%' 
        });
      } catch (optimizationError) {
        console.warn('Image optimization failed, uploading original:', optimizationError);
        // Continue with original file if optimization fails
      }
    }

    // API handles key naming; userId is kept for callsite compatibility.
    void userId;

    const result = await api.uploadToR2({ bucket, file: fileToUpload });

    return {
      success: true,
      url: result.url,
      fileName: result.fileName || file.name,
      fileSize: result.fileSize || file.size,
    };
  } catch (error) {
    console.error('Upload error:', error);
    return { 
      success: false, 
      error: error instanceof Error ? error.message : 'Upload failed' 
    };
  }
};

export const deleteFile = async (
  url: string,
  bucket: TemplateUploadBucket,
): Promise<boolean> => {
  void bucket;
  return deleteUploadedAsset(url);
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

export const validateFile = (
  file: File,
  type: 'image' | 'video' | 'file'
): { valid: boolean; error?: string } => {
  const bucket: TemplateUploadBucket =
    type === 'image' ? 'template-images' : type === 'video' ? 'template-videos' : 'template-files';
  const maxSize = UPLOAD_MAX_BYTES[bucket]; // the API enforces the same limit

  if (file.size > maxSize) {
    return { valid: false, error: `File size must be less than ${formatUploadLimit(maxSize)}` };
  }

  switch (type) {
    case 'image':
      if (!file.type.startsWith('image/')) {
        return { valid: false, error: 'Please select an image file' };
      }
      break;
    case 'video':
      if (!file.type.startsWith('video/')) {
        return { valid: false, error: 'Please select a video file' };
      }
      break;
    case 'file':
      // Allow any file type for general file uploads
      break;
  }

  return { valid: true };
};
